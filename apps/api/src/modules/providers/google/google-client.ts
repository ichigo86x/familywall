import { CalDavError, type CalDavErrorKind, type DiscoveredCalendar } from "../caldav/caldav-client";
import type { RemoteEvent } from "../caldav/ics-parser";

/**
 * Google Calendar and Google Tasks over the official REST APIs, authorised with the
 * household's own OAuth client (client id/secret from a Google Cloud project) and an
 * offline refresh token obtained once from the Admin page.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TASKS_API = "https://tasks.googleapis.com/tasks/v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_MARGIN_MS = 2 * 60 * 1000;
/** Completed tasks stay visible (struck through) for two days, then disappear. */
const COMPLETED_VISIBLE_MS = 2 * DAY_MS;

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/tasks"];

/** Stored encrypted in provider_accounts.secret_enc as JSON. */
export interface GoogleSecret {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GoogleEventTimes {
  startAt: string;
  endAt: string;
  allDay: boolean;
}

export interface GoogleEventEdit extends Partial<GoogleEventTimes> {
  title?: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes: string | null;
  completed: boolean;
  completedAt: string | null;
  due: string | null;
}

export class GoogleError extends CalDavError {
  public constructor(kind: CalDavErrorKind, message: string) {
    super(kind, message);
  }
}

interface GoogleEventJson {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const parseGoogleSecret = (raw: string): GoogleSecret => {
  try {
    const secret = JSON.parse(raw) as GoogleSecret;
    if (secret.clientId && secret.clientSecret && secret.refreshToken) {
      return secret;
    }
  } catch {
    // Falls through to the error below.
  }
  throw new GoogleError("auth", "Credenziali Google non valide: ricollega l'account.");
};

/** Calendar id from the remote URL stored for a Google calendar. */
export const googleCalendarUrl = (calendarId: string): string => `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}`;

const calendarIdFromUrl = (remoteUrl: string): string => decodeURIComponent(remoteUrl.split("/").filter(Boolean).pop() ?? "");

const dateOnly = (iso: string): string => iso.slice(0, 10);

const toApiTimes = (times: GoogleEventTimes, timeZone: string) =>
  times.allDay
    ? { start: { date: dateOnly(times.startAt) }, end: { date: dateOnly(times.endAt) } }
    : { start: { dateTime: times.startAt, timeZone }, end: { dateTime: times.endAt, timeZone } };

const instant = (value: { date?: string; dateTime?: string } | undefined): string | null => {
  if (value?.dateTime) {
    return new Date(value.dateTime).toISOString();
  }
  return value?.date ? `${value.date}T00:00:00.000Z` : null;
};

/** Email from the id_token returned with the "openid email" scopes (already verified by Google's TLS endpoint). */
const emailFromIdToken = (idToken: string | undefined): string | null => {
  const payload = idToken?.split(".")[1];
  if (!payload) {
    return null;
  }
  try {
    return (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
};

export class GoogleClient {
  private readonly accessTokens = new Map<string, { token: string; expiresAt: number }>();

  public constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 20_000,
    private readonly now: () => number = Date.now
  ) {}

  // -- OAuth ---------------------------------------------------------------

  public authUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
    const url = new URL(AUTH_URL);
    for (const [name, value] of Object.entries({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      // Forces a refresh token even if the client was authorised before (e.g. by Home Assistant).
      prompt: "consent",
      include_granted_scopes: "true",
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256"
    })) {
      url.searchParams.set(name, value);
    }
    return url.toString();
  }

  public async exchangeCode(input: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  }): Promise<{ refreshToken: string; email: string | null }> {
    const payload = await this.tokenRequest({
      grant_type: "authorization_code",
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier
    });
    if (!payload.refresh_token) {
      throw new GoogleError("auth", "Google non ha restituito un refresh token: riprova il collegamento.");
    }
    if (payload.access_token) {
      this.accessTokens.set(payload.refresh_token, { token: payload.access_token, expiresAt: this.now() + (payload.expires_in ?? 3600) * 1000 });
    }
    return { refreshToken: payload.refresh_token, email: emailFromIdToken(payload.id_token) };
  }

  // -- Calendar ------------------------------------------------------------

  public async listCalendars(secret: GoogleSecret): Promise<Array<DiscoveredCalendar & { writable: boolean }>> {
    const items = await this.paged<{ id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; accessRole?: string }>(
      secret,
      `${CALENDAR_API}/users/me/calendarList?maxResults=250`
    );
    return items.map((item) => ({
      remoteUrl: googleCalendarUrl(item.id),
      name: item.summaryOverride ?? item.summary ?? item.id,
      color: item.backgroundColor?.match(/^#[0-9a-f]{6}$/i) ? item.backgroundColor.toUpperCase() : null,
      writable: item.accessRole === "owner" || item.accessRole === "writer"
    }));
  }

  /**
   * Recurring series are expanded by Google (singleEvents). The occurrence key is the
   * instance id itself, which is what the API needs to change a single occurrence.
   */
  public async fetchEvents(secret: GoogleSecret, remoteUrl: string, from: Date, to: Date): Promise<RemoteEvent[]> {
    const query = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", maxResults: "2500" });
    const items = await this.paged<GoogleEventJson>(secret, `${this.eventsUrl(remoteUrl)}?${query.toString()}`);

    return items.flatMap((item): RemoteEvent[] => {
      const startAt = instant(item.start);
      const endAt = instant(item.end);
      if (item.status === "cancelled" || !startAt || !endAt) {
        return [];
      }
      return [
        {
          uid: item.recurringEventId ?? item.id,
          occurrenceKey: item.recurringEventId ? item.id : "",
          title: item.summary ?? "(senza titolo)",
          startAt,
          endAt,
          allDay: Boolean(item.start?.date),
          ...(item.description?.trim() ? { description: item.description.trim() } : {})
        }
      ];
    });
  }

  public async createEvent(
    secret: GoogleSecret,
    remoteUrl: string,
    input: { title: string; times: GoogleEventTimes; rrule: string | null; timeZone: string }
  ): Promise<string> {
    const created = (await this.request(secret, "POST", this.eventsUrl(remoteUrl), {
      summary: input.title,
      ...toApiTimes(input.times, input.timeZone),
      ...(input.rrule ? { recurrence: [`RRULE:${input.rrule}`] } : {})
    })) as { id: string };
    return created.id;
  }

  /**
   * scope "occurrence" patches the instance; scope "series" patches the recurring event and
   * shifts its start by the same offset the edited occurrence moved.
   */
  public async updateEvent(
    secret: GoogleSecret,
    remoteUrl: string,
    ref: { uid: string; occurrenceKey: string },
    scope: "occurrence" | "series",
    edit: GoogleEventEdit,
    timeZone: string
  ): Promise<void> {
    const base = this.eventsUrl(remoteUrl);
    const target = ref.occurrenceKey && scope === "occurrence" ? ref.occurrenceKey : ref.uid;
    const body: Record<string, unknown> = edit.title !== undefined ? { summary: edit.title } : {};

    if (edit.startAt && edit.endAt) {
      const times = { startAt: edit.startAt, endAt: edit.endAt, allDay: edit.allDay ?? false };
      if (ref.occurrenceKey && scope === "series") {
        const [occurrence, master] = (await Promise.all([
          this.request(secret, "GET", `${base}/${encodeURIComponent(ref.occurrenceKey)}`),
          this.request(secret, "GET", `${base}/${encodeURIComponent(ref.uid)}`)
        ])) as [GoogleEventJson, GoogleEventJson];
        const offset = new Date(times.startAt).getTime() - new Date(instant(occurrence.start)!).getTime();
        const duration = new Date(times.endAt).getTime() - new Date(times.startAt).getTime();
        const masterStart = new Date(new Date(instant(master.start)!).getTime() + offset);
        Object.assign(
          body,
          toApiTimes(
            { startAt: masterStart.toISOString(), endAt: new Date(masterStart.getTime() + duration).toISOString(), allDay: times.allDay },
            master.start?.timeZone ?? timeZone
          )
        );
      } else {
        Object.assign(body, toApiTimes(times, timeZone));
      }
    }

    if (Object.keys(body).length > 0) {
      await this.request(secret, "PATCH", `${base}/${encodeURIComponent(target)}`, body);
    }
  }

  public async deleteEvent(secret: GoogleSecret, remoteUrl: string, ref: { uid: string; occurrenceKey: string }, scope: "occurrence" | "series"): Promise<void> {
    const target = ref.occurrenceKey && scope === "occurrence" ? ref.occurrenceKey : ref.uid;
    await this.request(secret, "DELETE", `${this.eventsUrl(remoteUrl)}/${encodeURIComponent(target)}`, undefined, [404, 410]);
  }

  // -- Tasks ---------------------------------------------------------------

  public async listTaskLists(secret: GoogleSecret): Promise<Array<{ remoteId: string; name: string }>> {
    const items = await this.paged<{ id: string; title: string }>(secret, `${TASKS_API}/users/@me/lists?maxResults=100`);
    return items.map((item) => ({ remoteId: item.id, name: item.title }));
  }

  /** Open tasks plus the ones completed in the last two days. */
  public async listTasks(secret: GoogleSecret, listId: string): Promise<GoogleTask[]> {
    const query = new URLSearchParams({ showCompleted: "true", showHidden: "true", maxResults: "100" });
    const items = await this.paged<{ id: string; title?: string; notes?: string; status?: string; completed?: string; due?: string; deleted?: boolean }>(
      secret,
      `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks?${query.toString()}`,
      10
    );
    const threshold = this.now() - COMPLETED_VISIBLE_MS;
    return items
      .filter((item) => !item.deleted && (item.title ?? "").trim() !== "")
      .filter((item) => item.status !== "completed" || (item.completed !== undefined && Date.parse(item.completed) >= threshold))
      .map((item) => ({
        id: item.id,
        title: item.title ?? "",
        notes: item.notes ?? null,
        completed: item.status === "completed",
        completedAt: item.completed ?? null,
        due: item.due ?? null
      }));
  }

  public async createTask(secret: GoogleSecret, listId: string, title: string): Promise<string> {
    const created = (await this.request(secret, "POST", `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`, { title })) as { id: string };
    return created.id;
  }

  public async updateTask(secret: GoogleSecret, listId: string, taskId: string, patch: { title?: string; completed?: boolean }): Promise<void> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      body.title = patch.title;
    }
    if (patch.completed !== undefined) {
      body.status = patch.completed ? "completed" : "needsAction";
      // Reopening a task needs the completion date cleared too.
      body.completed = patch.completed ? new Date(this.now()).toISOString() : null;
    }
    await this.request(secret, "PATCH", `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, body);
  }

  public async deleteTask(secret: GoogleSecret, listId: string, taskId: string): Promise<void> {
    await this.request(secret, "DELETE", `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, undefined, [404, 410]);
  }

  // -- HTTP ----------------------------------------------------------------

  private eventsUrl(remoteUrl: string): string {
    return `${googleCalendarUrl(calendarIdFromUrl(remoteUrl))}/events`;
  }

  private async paged<T>(secret: GoogleSecret, url: string, maxPages = 20): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const pageUrl = pageToken ? `${url}${url.includes("?") ? "&" : "?"}pageToken=${encodeURIComponent(pageToken)}` : url;
      const body = (await this.request(secret, "GET", pageUrl)) as { items?: T[]; nextPageToken?: string };
      items.push(...(body.items ?? []));
      pageToken = body.nextPageToken;
      if (!pageToken) {
        break;
      }
    }
    return items;
  }

  private async request(secret: GoogleSecret, method: string, url: string, body?: unknown, okStatuses: number[] = []): Promise<unknown> {
    const call = async (token: string) =>
      this.send(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });

    let response = await call(await this.accessToken(secret));
    if (response.status === 401) {
      this.accessTokens.delete(secret.refreshToken);
      response = await call(await this.accessToken(secret));
    }
    if (okStatuses.includes(response.status)) {
      return null;
    }
    if (!response.ok) {
      throw await this.apiError(response);
    }
    return response.status === 204 ? null : response.json();
  }

  private async apiError(response: Response): Promise<GoogleError> {
    const detail = ((await response.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
    const suffix = detail ? `: ${detail}` : "";
    switch (response.status) {
      case 401:
        return new GoogleError("auth", "Google ha rifiutato l'accesso: ricollega l'account dalla sezione Admin.");
      case 403:
        return new GoogleError("forbidden", `Google non consente l'operazione${suffix}`);
      case 404:
        return new GoogleError("not-found", "Elemento non trovato su Google.");
      case 409:
      case 412:
        return new GoogleError("conflict", "L'elemento è stato modificato altrove nel frattempo. Ricarica e riprova.");
      default:
        return new GoogleError("http", `Google ha risposto HTTP ${response.status}${suffix}`);
    }
  }

  private async accessToken(secret: GoogleSecret): Promise<string> {
    const cached = this.accessTokens.get(secret.refreshToken);
    if (cached && this.now() < cached.expiresAt - TOKEN_MARGIN_MS) {
      return cached.token;
    }
    const payload = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: secret.refreshToken,
      client_id: secret.clientId,
      client_secret: secret.clientSecret
    });
    if (!payload.access_token) {
      throw new GoogleError("auth", "Google non ha restituito un token di accesso.");
    }
    this.accessTokens.set(secret.refreshToken, { token: payload.access_token, expiresAt: this.now() + (payload.expires_in ?? 3600) * 1000 });
    return payload.access_token;
  }

  private async tokenRequest(form: Record<string, string>): Promise<{ access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string }> {
    const response = await this.send(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString()
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; error_description?: string };
    if (!response.ok) {
      const reason = payload.error === "invalid_grant" ? "autorizzazione scaduta o revocata: ricollega l'account" : (payload.error_description ?? payload.error ?? `HTTP ${response.status}`);
      throw new GoogleError("auth", `Accesso Google non riuscito (${reason}).`);
    }
    return payload as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string };
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw new GoogleError("network", `Google non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
