import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type {
  CreateProviderAccountInput,
  GoogleAuthCompleteInput,
  GoogleAuthStartInput,
  GoogleAuthStartResponse,
  ProviderAccount,
  RemoteCalendar
} from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { CalDavClient, CalDavError, ICLOUD_CALDAV_URL, type CalDavCredentials } from "./caldav/caldav-client";
import { CookidooClient, DEFAULT_COOKIDOO_URL, parseCookidooSite } from "./cookidoo/cookidoo-client";
import { GoogleClient, parseGoogleSecret, type GoogleSecret } from "./google/google-client";
import { ProviderAccountsRepository } from "./provider-accounts.repository";
import { IcloudBridge, IcloudBridgeError } from "./icloud-web/icloud-bridge";
import { rmSync } from "node:fs";
import path from "node:path";
import { appConfig } from "../../config/app-config";

const COOKIDOO_COLOR = "#36A936";
/** An authorisation started in the Admin page must be completed within this time. */
const GOOGLE_AUTH_TTL_MS = 15 * 60 * 1000;

/** The meal plan is the only "calendar" of a Cookidoo account. */
export const cookidooCalendarUrl = (serverUrl: string): string => {
  const site = parseCookidooSite(serverUrl);
  return `${site.origin}/planning/${site.language}/my-week`;
};

export const toAppException = (error: unknown): AppException => {
  if (error instanceof AppException) {
    return error;
  }
  if (error instanceof CalDavError) {
    return error.kind === "auth" ? AppException.validation(error.message) : AppException.providerError(error.message);
  }
  if (error instanceof IcloudBridgeError) {
    return ["login_failed", "bad_code", "2sa_unsupported"].includes(error.code) ? AppException.validation(error.message) : AppException.providerError(error.message);
  }
  return AppException.providerError("Server del calendario non raggiungibile.");
};

interface PendingGoogleAuth extends GoogleAuthStartInput {
  codeVerifier: string;
  createdAt: number;
}

@Injectable()
export class ProvidersService {
  private readonly pendingGoogle = new Map<string, PendingGoogleAuth>();

  public constructor(
    private readonly accounts: ProviderAccountsRepository,
    private readonly caldav: CalDavClient,
    private readonly cookidoo: CookidooClient,
    private readonly google: GoogleClient,
    private readonly icloud: IcloudBridge
  ) {}

  public list(): ProviderAccount[] {
    return this.accounts.list();
  }

  /** Credentials are verified against the server before anything is stored. */
  public async create(input: CreateProviderAccountInput): Promise<ProviderAccount> {
    if (input.provider === "icloudweb") {
      return this.createIcloudWeb(input);
    }
    const serverUrl =
      input.provider === "icloud" ? null : input.provider === "cookidoo" ? (input.serverUrl ?? DEFAULT_COOKIDOO_URL) : input.serverUrl!;
    try {
      if (input.provider === "cookidoo") {
        await this.cookidoo.verify({ serverUrl: serverUrl!, username: input.username, password: input.password });
      } else {
        await this.caldav.discoverCalendars({
          serverUrl: serverUrl ?? ICLOUD_CALDAV_URL,
          username: input.username,
          password: input.password
        });
      }
    } catch (error) {
      throw toAppException(error);
    }

    return this.accounts.insert({
      provider: input.provider,
      label: input.label,
      username: input.username,
      password: input.password,
      serverUrl
    });
  }

  /**
   * iCloud Reminders: the Apple ID login happens in the pyicloud bridge. The account is kept when
   * Apple asks the two-factor code (status "verify"), and dropped when the password is refused.
   */
  private async createIcloudWeb(input: CreateProviderAccountInput): Promise<ProviderAccount> {
    const account = this.accounts.insert({ provider: "icloudweb", label: input.label, username: input.username, password: input.password, serverUrl: null });
    try {
      const { status } = await this.icloud.login(account.id, { appleId: input.username, password: input.password });
      this.accounts.recordStatus(account.id, status === "2fa" ? "verify" : "ok", status === "2fa" ? "Inserisci il codice di verifica mostrato sui dispositivi Apple." : null);
    } catch (error) {
      this.accounts.delete(account.id);
      throw toAppException(error);
    }
    return this.accounts.findById(account.id)!;
  }

  /** The two-factor code shown on the Apple devices; afterwards the session is trusted for a while. */
  public async verifyIcloud(accountId: string, code: string): Promise<ProviderAccount> {
    const account = this.requireIcloudWeb(accountId);
    try {
      try {
        await this.icloud.verify(account.id, code);
      } catch (error) {
        // The bridge restarted since the login: open the session again, then check the code.
        if (!(error instanceof IcloudBridgeError) || error.code !== "auth_required") {
          throw error;
        }
        await this.icloud.login(account.id, this.icloudCredentials(account.id));
        await this.icloud.verify(account.id, code);
      }
      this.accounts.recordStatus(account.id, "ok", null);
    } catch (error) {
      throw toAppException(error);
    }
    return this.accounts.findById(account.id)!;
  }

  /** Opens the session again (Apple sends a new code to the devices when it wants one). */
  public async reconnectIcloud(accountId: string): Promise<ProviderAccount> {
    const account = this.requireIcloudWeb(accountId);
    try {
      const { status } = await this.icloud.login(account.id, this.icloudCredentials(account.id));
      if (status === "2fa") {
        await this.icloud.requestCode(account.id).catch(() => undefined);
      }
      this.accounts.recordStatus(account.id, status === "2fa" ? "verify" : "ok", status === "2fa" ? "Inserisci il codice di verifica mostrato sui dispositivi Apple." : null);
    } catch (error) {
      this.accounts.recordStatus(account.id, "error", error instanceof Error ? error.message : "Errore iCloud.");
      throw toAppException(error);
    }
    return this.accounts.findById(account.id)!;
  }

  public icloudCredentials(accountId: string): { appleId: string; password: string } {
    const credentials = this.accounts.credentials(accountId);
    if (!credentials) {
      throw AppException.notFound("Account non trovato.");
    }
    return { appleId: credentials.username, password: credentials.password };
  }

  private requireIcloudWeb(accountId: string): ProviderAccount {
    const account = this.accounts.findById(accountId);
    if (!account || account.provider !== "icloudweb") {
      throw AppException.notFound("Account Promemoria iCloud non trovato.");
    }
    return account;
  }

  /** Step 1 of the Google OAuth flow: returns the consent page URL (PKCE + state). */
  public startGoogleAuth(input: GoogleAuthStartInput): GoogleAuthStartResponse {
    this.dropExpiredGoogleAuths();
    const state = randomBytes(18).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    this.pendingGoogle.set(state, { ...input, codeVerifier, createdAt: Date.now() });
    return { state, authUrl: this.google.authUrl({ clientId: input.clientId, redirectUri: input.redirectUri, state, codeChallenge }) };
  }

  /**
   * Step 2: the code comes from the redirected address, pasted by the Admin
   * (loopback/desktop clients) or received on the callback route.
   */
  public async completeGoogleAuth(input: GoogleAuthCompleteInput): Promise<ProviderAccount> {
    this.dropExpiredGoogleAuths();
    let params: URLSearchParams;
    try {
      params = new URL(input.redirectedUrl).searchParams;
    } catch {
      params = new URLSearchParams(input.redirectedUrl.replace(/^[^?]*\?/, ""));
    }

    const state = params.get("state") ?? input.state;
    const pending = this.pendingGoogle.get(state);
    if (!pending || state !== input.state) {
      throw AppException.validation('Collegamento Google scaduto o non riconosciuto: ricomincia dal pulsante "Apri Google".');
    }
    const error = params.get("error");
    if (error) {
      throw AppException.validation(error === "access_denied" ? "Accesso negato nella pagina di Google." : `Google ha risposto: ${error}.`);
    }
    const code = params.get("code");
    if (!code) {
      throw AppException.validation("L'indirizzo incollato non contiene il codice di Google (parametro code).");
    }

    try {
      const { refreshToken, email } = await this.google.exchangeCode({
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
        redirectUri: pending.redirectUri,
        code,
        codeVerifier: pending.codeVerifier
      });
      const secret: GoogleSecret = { clientId: pending.clientId, clientSecret: pending.clientSecret, refreshToken };
      // Fails early when the Calendar API is not enabled in the client's Google Cloud project.
      await this.google.listCalendars(secret);
      this.pendingGoogle.delete(state);
      return this.accounts.insert({
        provider: "google",
        label: pending.label,
        username: email ?? pending.label,
        password: JSON.stringify(secret),
        serverUrl: null
      });
    } catch (caught) {
      throw toAppException(caught);
    }
  }

  public async discover(accountId: string, addedRemoteUrls: Set<string>): Promise<RemoteCalendar[]> {
    const credentials = this.accounts.credentials(accountId);
    if (!credentials) {
      throw AppException.notFound("Account non trovato.");
    }

    if (this.accounts.findById(accountId)?.provider === "icloudweb") {
      // Calendars of iCloud come through CalDAV with an app password ("iCloud" accounts).
      return [];
    }
    try {
      const provider = this.accounts.findById(accountId)?.provider;
      const calendars =
        provider === "cookidoo"
          ? await this.discoverCookidoo(credentials)
          : provider === "google"
            ? await this.google.listCalendars(parseGoogleSecret(credentials.password))
            : await this.caldav.discoverCalendars(credentials);
      this.accounts.recordCheck(accountId, null);
      return calendars.map((calendar) => ({
        remoteUrl: calendar.remoteUrl,
        name: calendar.name,
        color: calendar.color,
        alreadyAdded: addedRemoteUrls.has(calendar.remoteUrl)
      }));
    } catch (error) {
      const appError = toAppException(error);
      this.accounts.recordCheck(accountId, error instanceof Error ? error.message : "Unknown error");
      throw appError;
    }
  }

  public delete(accountId: string): void {
    const account = this.accounts.findById(accountId);
    if (!account) {
      throw AppException.notFound("Account non trovato.");
    }
    this.accounts.delete(accountId);
    if (account.provider === "icloudweb") {
      // The pyicloud session (cookies, trusted device) goes with the account.
      void this.icloud.forget(accountId);
      rmSync(path.join(appConfig.dataDir, "icloud", accountId), { recursive: true, force: true });
    }
  }

  private async discoverCookidoo(credentials: CalDavCredentials) {
    await this.cookidoo.verify(credentials);
    return [{ remoteUrl: cookidooCalendarUrl(credentials.serverUrl), name: "Piano pasti Cookidoo", color: COOKIDOO_COLOR }];
  }

  private dropExpiredGoogleAuths(): void {
    const now = Date.now();
    for (const [state, pending] of this.pendingGoogle) {
      if (now - pending.createdAt > GOOGLE_AUTH_TTL_MS) {
        this.pendingGoogle.delete(state);
      }
    }
  }
}
