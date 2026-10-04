import { createHash, randomBytes } from "node:crypto";
import { CalDavError, type CalDavErrorKind } from "../caldav/caldav-client";
import type { RemoteEvent } from "../caldav/ics-parser";

/**
 * Read-only client for the Cookidoo (Thermomix/Bimby) meal plan.
 *
 * Cookidoo has no public API, iCal or CalDAV feed. This follows the flow of the
 * MIT-licensed `cookidoo-api` library used by Home Assistant: an OAuth2
 * authorization-code login with PKCE as the public mobile client (no client secret),
 * then the "my week" planning endpoint with a bearer token.
 */

const CIAM_BASE_URL = "https://ciam.prod.cookidoo.vorwerk-digital.com";
const CIAM_LOGIN_URL = `${CIAM_BASE_URL}/login-srv/login`;
const OIDC_DISCOVERY_URL = `${CIAM_BASE_URL}/.well-known/openid-configuration`;
const CLIENT_ID = "mobile-android";
const REDIRECT_URI = "com.vorwerk.cookidoo://code-grant";
const SCOPE = "openid profile email offline offline_access";
/** The login pages sit behind Cloudflare, which flags non-browser user agents. */
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MY_WEEK_REL = "planning:api-my-week-from-date";
const FALLBACK_MY_WEEK_PATH = "planning/{language}/api/my-week/{day}";
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
const WEEK_CACHE_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Meal plans are short-term: only weeks near today are fetched, whatever range the planner asks. */
const PAST_DAYS = 35;
const FUTURE_DAYS = 63;

export const DEFAULT_COOKIDOO_URL = "https://cookidoo.it/foundation/it-IT";

export interface CookidooCredentials {
  /** Localized site, e.g. https://cookidoo.it/foundation/it-IT (country and language come from it). */
  serverUrl: string;
  username: string;
  password: string;
}

export class CookidooError extends CalDavError {
  public constructor(kind: CalDavErrorKind, message: string) {
    super(kind, message);
  }
}

interface Session {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

interface CalendarDayJson {
  dayKey: string;
  recipes?: Array<{ id: string; title: string }>;
  customerRecipes?: Array<{ id: string; title: string }>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const base64Url = (buffer: Buffer): string => buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const mondayOf = (date: Date): Date => {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS);
};

/** Site origin, language and market (country) from the localized Cookidoo URL. */
export const parseCookidooSite = (serverUrl: string): { origin: string; language: string; market: string } => {
  const url = new URL(serverUrl);
  const language = url.pathname.split("/").filter(Boolean).pop() ?? "it-IT";
  const region = language.split("-")[1]?.toLowerCase();
  const tld = url.hostname.split(".").pop() ?? "it";
  const market = language === "en-GB" ? "ie" : (region ?? tld);
  return { origin: url.origin, language, market };
};

/** Minimal cookie jar for the login redirects (all on the CIAM host). */
class CookieJar {
  private readonly cookies = new Map<string, string>();

  public store(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const separator = pair?.indexOf("=") ?? -1;
      if (pair && separator > 0) {
        this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }
    }
  }

  public header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

export class CookidooClient {
  private readonly sessions = new Map<string, Session>();
  private readonly weekCache = new Map<string, { at: number; days: CalendarDayJson[] }>();
  private readonly weekPaths = new Map<string, string>();
  private oidc: { authorization_endpoint: string; token_endpoint: string } | null = null;

  public constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 20_000,
    private readonly now: () => number = Date.now
  ) {}

  /** Signs in and reads the current week, so wrong credentials fail before the account is saved. */
  public async verify(credentials: CookidooCredentials): Promise<void> {
    this.sessions.delete(this.sessionKey(credentials));
    await this.week(credentials, isoDay(mondayOf(new Date(this.now()))), true);
  }

  /** Planned recipes as all-day events, one per recipe. */
  public async fetchMealPlan(credentials: CookidooCredentials, from: Date, to: Date): Promise<RemoteEvent[]> {
    const today = this.now();
    const start = Math.max(from.getTime(), today - PAST_DAYS * DAY_MS);
    const end = Math.min(to.getTime(), today + FUTURE_DAYS * DAY_MS);
    if (start >= end) {
      return [];
    }

    const mondays: string[] = [];
    for (let monday = mondayOf(new Date(start)).getTime(); monday < end; monday += 7 * DAY_MS) {
      mondays.push(isoDay(new Date(monday)));
    }

    const weeks: CalendarDayJson[][] = [];
    for (const monday of mondays) {
      weeks.push(await this.week(credentials, monday));
    }

    const fromDay = isoDay(new Date(start));
    const toDay = isoDay(new Date(end));
    return weeks
      .flat()
      .filter((day) => day.dayKey >= fromDay && day.dayKey <= toDay)
      .flatMap((day) =>
        [...(day.recipes ?? []), ...(day.customerRecipes ?? [])].map((recipe): RemoteEvent => {
          const startAt = new Date(`${day.dayKey}T00:00:00.000Z`);
          return {
            uid: `cookidoo-${day.dayKey}-${recipe.id}`,
            occurrenceKey: "",
            title: recipe.title,
            startAt: startAt.toISOString(),
            endAt: new Date(startAt.getTime() + DAY_MS).toISOString(),
            allDay: true
          };
        })
      );
  }

  private async week(credentials: CookidooCredentials, monday: string, skipCache = false): Promise<CalendarDayJson[]> {
    const cacheKey = `${this.sessionKey(credentials)}|${monday}`;
    const cached = this.weekCache.get(cacheKey);
    if (!skipCache && cached && this.now() - cached.at < WEEK_CACHE_MS) {
      return cached.days;
    }

    const site = parseCookidooSite(credentials.serverUrl);
    const path = (await this.myWeekPath(site.origin)).replace("{language}", site.language).replace("{day}", monday);
    const body = (await this.apiGet(credentials, `${site.origin}/${path}`)) as { myDays?: CalendarDayJson[] } | null;
    const days = Array.isArray(body?.myDays) ? body.myDays : [];
    this.weekCache.set(cacheKey, { at: this.now(), days });
    return days;
  }

  /** Live path of the "my week" endpoint from the planning service discovery document. */
  private async myWeekPath(origin: string): Promise<string> {
    const known = this.weekPaths.get(origin);
    if (known) {
      return known;
    }

    let path = FALLBACK_MY_WEEK_PATH;
    try {
      const response = await this.send(`${origin}/planning/.well-known/home`, { headers: { Accept: "application/json", "User-Agent": BROWSER_UA } });
      if (response.ok) {
        const links = ((await response.json()) as { _links?: Record<string, { href?: string } | Array<{ href?: string }>> })._links ?? {};
        const link = links[MY_WEEK_REL];
        const href = Array.isArray(link) ? link[0]?.href : link?.href;
        if (href && /\{lang\}/.test(href) && /\{dayKey\}/.test(href)) {
          path = href
            .replace(/^https?:\/\/[^/]+\//, "")
            .replace(/\{[?&].*$/, "")
            .replace("{lang}", "{language}")
            .replace("{dayKey}", "{day}");
        }
      }
    } catch {
      // Discovery is best effort: the documented path is used instead.
    }
    this.weekPaths.set(origin, path);
    return path;
  }

  private async apiGet(credentials: CookidooCredentials, url: string): Promise<unknown> {
    let session = await this.session(credentials);
    let response = await this.send(url, { headers: { Accept: "application/json", Authorization: `Bearer ${session.accessToken}` } });

    if (response.status === 401) {
      // Token revoked or expired early: sign in again once.
      this.sessions.delete(this.sessionKey(credentials));
      session = await this.session(credentials);
      response = await this.send(url, { headers: { Accept: "application/json", Authorization: `Bearer ${session.accessToken}` } });
    }
    if (response.status === 401 || response.status === 403) {
      throw new CookidooError("auth", "Cookidoo ha rifiutato l'accesso: controlla email e password.");
    }
    if (!response.ok) {
      throw new CookidooError("http", `Cookidoo ha risposto HTTP ${response.status}.`);
    }
    return response.status === 204 ? null : response.json();
  }

  private async session(credentials: CookidooCredentials): Promise<Session> {
    const key = this.sessionKey(credentials);
    const current = this.sessions.get(key);
    if (current && this.now() < current.expiresAt - TOKEN_MARGIN_MS) {
      return current;
    }

    let next: Session | null = null;
    if (current?.refreshToken) {
      next = await this.refresh(current.refreshToken).catch(() => null);
    }
    next ??= await this.login(credentials);
    this.sessions.set(key, next);
    return next;
  }

  private async login(credentials: CookidooCredentials): Promise<Session> {
    const oidc = await this.discovery();
    const site = parseCookidooSite(credentials.serverUrl);
    const verifier = base64Url(randomBytes(48));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());
    const state = base64Url(randomBytes(12));
    const jar = new CookieJar();

    const authorize = new URL(oidc.authorization_endpoint);
    for (const [name, value] of Object.entries({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      market: site.market,
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ui_locales: site.language
    })) {
      authorize.searchParams.set(name, value);
    }

    // 1. Reach the login form, following redirects by hand to keep the cookies.
    let url = authorize.toString();
    let page: Response | null = null;
    for (let hop = 0; hop < 10; hop += 1) {
      const response = await this.send(url, { headers: { "User-Agent": BROWSER_UA, Cookie: jar.header() }, redirect: "manual" });
      jar.store(response);
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url).toString();
        this.assertCiam(url);
        continue;
      }
      page = response;
      break;
    }
    if (!page || page.status !== 200) {
      throw new CookidooError("http", `Pagina di accesso Cookidoo non raggiungibile (HTTP ${page?.status ?? "redirect"}).`);
    }

    const html = await page.text();
    const requestId =
      html.match(/<input[^>]*name=["']requestId["'][^>]*value=["']([^"']+)["']/)?.[1] ??
      html.match(/<input[^>]*value=["']([0-9a-f-]{36})["'][^>]*name=["']requestId["']/)?.[1];
    if (!requestId) {
      throw new CookidooError("http", "La pagina di accesso Cookidoo è cambiata: accesso non riuscito.");
    }

    // 2. Submit the credentials; the redirect chain ends on the app scheme with the code.
    let code: string | null = null;
    let target = CIAM_LOGIN_URL;
    let init: RequestInit = {
      method: "POST",
      headers: { "User-Agent": BROWSER_UA, Cookie: jar.header(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ requestId, username: credentials.username, password: credentials.password }).toString(),
      redirect: "manual"
    };
    for (let hop = 0; hop < 10; hop += 1) {
      const response = await this.send(target, init);
      jar.store(response);
      const location = response.headers.get("location");
      if (!(response.status >= 300 && response.status < 400 && location)) {
        break;
      }
      if (location.startsWith(REDIRECT_URI)) {
        const query = new URL(location.replace(REDIRECT_URI, "https://callback.invalid/")).searchParams;
        if (query.get("state") !== state) {
          throw new CookidooError("auth", "Accesso Cookidoo non valido (state diverso).");
        }
        code = query.get("code");
        break;
      }
      target = new URL(location, target).toString();
      this.assertCiam(target);
      init = { headers: { "User-Agent": BROWSER_UA, Cookie: jar.header() }, redirect: "manual" };
    }
    if (!code) {
      throw new CookidooError("auth", "Email o password Cookidoo non corrette.");
    }

    // 3. Exchange the code (public client: PKCE, no secret).
    return this.token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier, client_id: CLIENT_ID });
  }

  private async refresh(refreshToken: string): Promise<Session> {
    return this.token({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: CLIENT_ID });
  }

  private async token(form: Record<string, string>): Promise<Session> {
    const oidc = await this.discovery();
    const response = await this.send(oidc.token_endpoint, {
      method: "POST",
      headers: { "User-Agent": BROWSER_UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString()
    });
    if (!response.ok) {
      throw new CookidooError("auth", `Accesso Cookidoo rifiutato (HTTP ${response.status}).`);
    }
    const payload = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!payload.access_token) {
      throw new CookidooError("auth", "Risposta di accesso Cookidoo non valida.");
    }
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? form.refresh_token ?? null,
      expiresAt: this.now() + (payload.expires_in ?? 43_200) * 1000
    };
  }

  private async discovery(): Promise<{ authorization_endpoint: string; token_endpoint: string }> {
    if (!this.oidc) {
      const response = await this.send(OIDC_DISCOVERY_URL, { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } });
      if (!response.ok) {
        throw new CookidooError("http", `Servizio di accesso Cookidoo non disponibile (HTTP ${response.status}).`);
      }
      this.oidc = (await response.json()) as { authorization_endpoint: string; token_endpoint: string };
    }
    return this.oidc;
  }

  /** The login redirects carry session cookies: only follow them to Vorwerk's own HTTPS hosts (CIAM, eu.login.vorwerk.com). */
  private assertCiam(url: string): void {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:" || !/(^|\.)vorwerk(-digital)?\.com$/.test(hostname)) {
      throw new CookidooError("auth", "Accesso Cookidoo reindirizzato su un host inatteso.");
    }
  }

  private sessionKey(credentials: CookidooCredentials): string {
    return `${credentials.username.toLowerCase()}|${credentials.serverUrl}`;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw new CookidooError("network", `Cookidoo non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
