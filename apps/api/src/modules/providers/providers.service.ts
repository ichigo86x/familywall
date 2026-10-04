import { Injectable } from "@nestjs/common";
import type { CreateProviderAccountInput, ProviderAccount, RemoteCalendar } from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { CalDavClient, CalDavError, ICLOUD_CALDAV_URL, type CalDavCredentials } from "./caldav/caldav-client";
import { CookidooClient, DEFAULT_COOKIDOO_URL, parseCookidooSite } from "./cookidoo/cookidoo-client";
import { ProviderAccountsRepository } from "./provider-accounts.repository";

const COOKIDOO_COLOR = "#36A936";

/** The meal plan is the only "calendar" of a Cookidoo account. */
export const cookidooCalendarUrl = (serverUrl: string): string => {
  const site = parseCookidooSite(serverUrl);
  return `${site.origin}/planning/${site.language}/my-week`;
};

const toAppException = (error: unknown): AppException => {
  if (error instanceof CalDavError) {
    return error.kind === "auth" ? AppException.validation(error.message) : AppException.providerError(error.message);
  }
  return AppException.providerError("Server del calendario non raggiungibile.");
};

@Injectable()
export class ProvidersService {
  public constructor(
    private readonly accounts: ProviderAccountsRepository,
    private readonly caldav: CalDavClient,
    private readonly cookidoo: CookidooClient
  ) {}

  public list(): ProviderAccount[] {
    return this.accounts.list();
  }

  /** Credentials are verified against the server before anything is stored. */
  public async create(input: CreateProviderAccountInput): Promise<ProviderAccount> {
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

  public async discover(accountId: string, addedRemoteUrls: Set<string>): Promise<RemoteCalendar[]> {
    const credentials = this.accounts.credentials(accountId);
    if (!credentials) {
      throw AppException.notFound("Account non trovato.");
    }

    try {
      const calendars = this.accounts.findById(accountId)?.provider === "cookidoo" ? await this.discoverCookidoo(credentials) : await this.caldav.discoverCalendars(credentials);
      this.accounts.recordCheck(accountId, null);
      return calendars.map((calendar) => ({ ...calendar, alreadyAdded: addedRemoteUrls.has(calendar.remoteUrl) }));
    } catch (error) {
      const appError = toAppException(error);
      this.accounts.recordCheck(accountId, error instanceof Error ? error.message : "Unknown error");
      throw appError;
    }
  }

  private async discoverCookidoo(credentials: CalDavCredentials) {
    await this.cookidoo.verify(credentials);
    return [{ remoteUrl: cookidooCalendarUrl(credentials.serverUrl), name: "Piano pasti Cookidoo", color: COOKIDOO_COLOR }];
  }

  public delete(accountId: string): void {
    if (!this.accounts.findById(accountId)) {
      throw AppException.notFound("Account non trovato.");
    }
    this.accounts.delete(accountId);
  }
}
