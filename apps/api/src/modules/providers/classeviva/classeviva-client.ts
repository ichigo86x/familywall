import { Logger } from "@nestjs/common";
import { CalDavError, type CalDavErrorKind } from "../caldav/caldav-client";
import type { RemoteEvent } from "../caldav/ics-parser";

/**
 * Read-only client for the ClasseViva (Spaggiari) school register: homework, tests and teaching material.
 *
 * Spaggiari has no public API. Two unofficial ones are used, as documented by the community:
 * - the web API "rest/w1" of the current portal (login on AuthApi4, session cookie): the "Compiti" section
 *   (homeworks/index), the agenda (agendav2) and "Didattica" (github.com/ebordoni/classeviva-agent-diary);
 * - the older app API "rest/v1" (login with the app's key, token): the identities of a parent's children
 *   and, as a fallback, the agenda (github.com/Lioydiano/Classeviva-Official-Endpoints).
 * Both may stop working if Spaggiari changes them.
 */

const V1_URL = "https://web.spaggiari.eu/rest/v1";
const W1_URL = "https://web.spaggiari.eu/rest/w1";
const WEB_LOGIN_URL = "https://web.spaggiari.eu/auth-p7/app/default/AuthApi4.php?a=aLoginPwd";
/** The app's headers: v1 requests without them are refused. */
const APP_HEADERS = { "User-Agent": "CVVS/std/4.2.3 Android/12", "Z-Dev-Apikey": "Tg1NWEwNGIgIC0K", "Content-Type": "application/json" };
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36";
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
/** The web session lasts 90 minutes; it is renewed a little earlier. */
const WEB_SESSION_MS = 80 * 60 * 1000;
/** Days per agenda request. */
const CHUNK_DAYS = 31;
/** Remote URL of a ClasseViva calendar: one per identity (student, or parent of one child). */
const URL_PREFIX = "classeviva://";
const DAY_MS = 86_400_000;

export class ClasseVivaError extends CalDavError {
  public constructor(kind: CalDavErrorKind, message: string) {
    super(kind, message);
  }
}

export interface ClasseVivaCredentials {
  username: string;
  password: string;
}

export interface ClasseVivaIdentity {
  ident: string;
  name: string;
}

interface LoginJson {
  ident?: string;
  firstName?: string;
  lastName?: string;
  token?: string;
  expire?: string;
  choices?: Array<{ ident: string; name?: string; school?: string }>;
}

interface AgendaEntry {
  evtId: number;
  evtCode: string;
  evtDatetimeBegin: string;
  evtDatetimeEnd: string;
  isFullDay: boolean;
  notes: string | null;
  authorName: string | null;
  subjectDesc: string | null;
  homeworkId?: number | null;
}

interface DidacticsFolder {
  folderId: number;
  folderName: string;
  lastShareDT?: string | null;
}

interface DidacticsContent {
  contentId: number;
  contentName: string;
  shareDT?: string | null;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const classeVivaUrl = (ident: string): string => `${URL_PREFIX}${ident}`;
export const isClasseVivaUrl = (url: string): boolean => url.startsWith(URL_PREFIX);
const identOf = (url: string): string => url.slice(URL_PREFIX.length);
/** "G1234567X" → "G12…7X" in the log. */
const masked = (ident: string): string => (ident.length > 5 ? `${ident.slice(0, 3)}…${ident.slice(-2)}` : ident);
/** "S1234567X" or "G1234567X" → "1234567": the student id of the v1 paths. */
const studentId = (ident: string): string => ident.replace(/\D/g, "");
const compactDate = (date: Date): string => date.toISOString().slice(0, 10).replace(/-/g, "");
const capitalized = (text: string): string => text.charAt(0) + text.slice(1).toLowerCase();
const firstLine = (text: string): string => text.split("\n")[0]!.slice(0, 120);

/** An all-day item on a date ("YYYY-MM-DD..."). */
const dayEvent = (uid: string, title: string, date: string, description: string): RemoteEvent => {
  const day = date.slice(0, 10);
  return {
    uid,
    occurrenceKey: "",
    title,
    startAt: `${day}T00:00:00.000Z`,
    endAt: new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString(),
    allDay: true,
    ...(description ? { description } : {})
  };
};

/** Homework ("AGHW") is shown on its day; other agenda entries (tests, notes) keep their times. */
export const agendaToEvents = (agenda: AgendaEntry[]): RemoteEvent[] =>
  agenda.map((entry) => {
    const homework = entry.evtCode === "AGHW";
    const subject = entry.subjectDesc ? capitalized(entry.subjectDesc) : (entry.authorName ?? "Scuola");
    const notes = (entry.notes ?? "").trim();
    const title = `${homework ? "📚" : "📝"} ${subject}${notes ? `: ${firstLine(notes)}` : ""}`;
    if (homework || entry.isFullDay) {
      return dayEvent(`classeviva-${entry.evtId}`, title, entry.evtDatetimeBegin, notes);
    }
    return {
      uid: `classeviva-${entry.evtId}`,
      occurrenceKey: "",
      title,
      startAt: new Date(entry.evtDatetimeBegin).toISOString(),
      endAt: new Date(entry.evtDatetimeEnd).toISOString(),
      allDay: false,
      ...(notes ? { description: notes } : {})
    };
  });

/**
 * The array of items of an answer, whatever its key: the web API is not documented and its shapes vary
 * ({ items: [...] }, { homeworks: [...] }, a bare array, or one level deeper).
 */
export const itemsOf = (body: unknown, keys: string[]): Array<Record<string, unknown>> => {
  if (Array.isArray(body)) {
    return body as Array<Record<string, unknown>>;
  }
  if (!body || typeof body !== "object") {
    return [];
  }
  const record = body as Record<string, unknown>;
  for (const key of [...keys, ...Object.keys(record)]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value as Array<Record<string, unknown>>;
    }
    if (value && typeof value === "object" && keys.includes(key)) {
      const nested = itemsOf(value, keys);
      if (nested.length > 0) {
        return nested;
      }
    }
  }
  return [];
};

const pick = (item: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (value && typeof value === "object" && typeof (value as Record<string, unknown>).description === "string") {
      return String((value as Record<string, unknown>).description);
    }
  }
  return null;
};

/** "2026-10-15", "2026-10-15T08:00:00+02:00", "20261015" or "15/10/2026" → "2026-10-15". */
const isoDay = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const italian = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(value);
  if (italian) {
    return `${italian[3]}-${italian[2]}-${italian[1]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : null;
};

/** Items of the "Compiti" section, on their due date. */
export const homeworksToEvents = (items: Array<Record<string, unknown>>): RemoteEvent[] =>
  items.flatMap((item, index) => {
    const date = isoDay(pick(item, ["dueDate", "expiryDate", "deliveryDate", "dataConsegna", "data_consegna", "endDate", "date", "evtDate", "evtDatetimeBegin", "data"]));
    if (!date) {
      return [];
    }
    const text = pick(item, ["text", "homeworkText", "notes", "description", "content", "evtText", "testo", "title"]) ?? "";
    const subjectName = pick(item, ["subjectDesc", "subjectName", "subject", "materia"]);
    const teacher = pick(item, ["teacherName", "authorName", "docente"]);
    const subject = subjectName ? capitalized(subjectName) : "Compiti";
    const description = [text, teacher ? `(${teacher})` : ""].filter(Boolean).join("\n");
    const id = pick(item, ["id", "homeworkId", "evtId"]) ?? `${date}-${index}`;
    return [dayEvent(`classeviva-hw-${id}`, `📚 ${subject}${text ? `: ${firstLine(text)}` : ""}`, date, description)];
  });

/** Field names of an answer, for the log (never the values: they are the children's data). */
const shapeOf = (body: unknown, items: Array<Record<string, unknown>>): string =>
  `${Array.isArray(body) ? "[array]" : body && typeof body === "object" ? `{${Object.keys(body).join(",")}}` : typeof body}` +
  ` ${items.length} voci${items[0] ? ` [${Object.keys(items[0]).join(",")}]` : ""}`;

export class ClasseVivaClient {
  private readonly logger = new Logger("ClasseViva");
  private readonly sessions = new Map<string, { token: string; ident: string; expiresAt: number }>();
  private readonly webSessions = new Map<string, { cookie: string; id: string; expiresAt: number }>();

  public constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => number = Date.now
  ) {}

  /** The identities of the account: the student, or one per child for a parent. */
  public async identities(credentials: ClasseVivaCredentials): Promise<ClasseVivaIdentity[]> {
    const login = await this.login(credentials, null);
    if (login.choices?.length) {
      return login.choices.map((choice) => ({ ident: choice.ident, name: choice.name?.trim() || choice.ident }));
    }
    const name = [login.firstName, login.lastName].filter(Boolean).join(" ").trim();
    return [{ ident: login.ident!, name: name || login.ident! }];
  }

  /**
   * Homework ("Compiti"), agenda and teaching material shared in the range, from the web API; when the web
   * login is refused, the agenda of the app API.
   */
  public async fetchEvents(credentials: ClasseVivaCredentials, remoteUrl: string, from: Date, to: Date): Promise<RemoteEvent[]> {
    const ident = identOf(remoteUrl);
    let web: { cookie: string; id: string };
    try {
      web = await this.webSession(ident, credentials.password);
    } catch (webError) {
      this.logger.warn(`${masked(ident)}: web portal login failed (${(webError as Error).message}), using the app agenda.`);
      try {
        const events = await this.v1Agenda(credentials, ident, from, to);
        this.logger.log(`${masked(ident)}: app agenda read, ${events.length} items.`);
        return events;
      } catch (appError) {
        throw new ClasseVivaError("http", `${(webError as Error).message} ${(appError as Error).message}`);
      }
    }
    const fromDay = from.toISOString().slice(0, 10);
    const toDay = to.toISOString().slice(0, 10);
    const inRange = (date: string | null | undefined) => Boolean(date) && date!.slice(0, 10) >= fromDay && date!.slice(0, 10) <= toDay;

    const homeworksBody = await this.webGet(web, `/students/${web.id}/homeworks/index`, "lettura dei compiti");
    const homeworks = itemsOf(homeworksBody, ["items", "homeworks", "compiti", "data"]);
    const agenda: AgendaEntry[] = [];
    let agendaShape = "";
    for (let start = from; start < to; start = new Date(start.getTime() + CHUNK_DAYS * DAY_MS)) {
      const end = new Date(Math.min(to.getTime(), start.getTime() + (CHUNK_DAYS - 1) * DAY_MS));
      const body = await this.webGet(web, `/students/${web.id}/agendav2/all/${compactDate(start)}/${compactDate(end)}`, "lettura dell'agenda");
      const entries = itemsOf(body, ["agenda", "items", "events"]);
      agendaShape ||= shapeOf(body, entries);
      agenda.push(...(entries as unknown as AgendaEntry[]).filter((entry) => entry.evtId !== undefined && typeof entry.evtDatetimeBegin === "string"));
    }
    // Agenda homework already in "Compiti" is shown once.
    const homeworkIds = new Set(homeworks.map((item) => Number(item.id ?? item.homeworkId)));
    const uniqueAgenda = [...new Map(agenda.map((entry) => [entry.evtId, entry])).values()].filter((entry) => !(entry.homeworkId && homeworkIds.has(entry.homeworkId)));

    const homeworkEvents = homeworksToEvents(homeworks);
    const events = [
      ...homeworkEvents.filter((event) => inRange(event.startAt)),
      ...agendaToEvents(uniqueAgenda),
      ...(await this.didactics(web, inRange))
    ];
    // What ClasseViva answered (field names and counts only), to tell an empty register from a changed API.
    this.logger.log(
      `${masked(ident)} (id ${web.id}) ${fromDay}..${toDay}: Compiti ${shapeOf(homeworksBody, homeworks)}, ${homeworkEvents.length} con data; ` +
        `agenda ${agendaShape || "vuota"}; ${events.length} voci mostrate.`
    );
    return events;
  }

  /** Material shared by the teachers in "Didattica" (sometimes the homework is there), on the day it was shared. */
  private async didactics(web: { cookie: string; id: string }, inRange: (date: string | null | undefined) => boolean): Promise<RemoteEvent[]> {
    let folders: DidacticsFolder[];
    try {
      folders = ((await this.webGet(web, `/students/${web.id}/didactics`, "lettura della didattica")) as { didacticts?: DidacticsFolder[] }).didacticts ?? [];
    } catch {
      // Not every school uses it: homework and agenda are still shown.
      return [];
    }
    const events: RemoteEvent[] = [];
    // Only folders with something shared in the range are opened.
    for (const folder of folders.filter((entry) => inRange(entry.lastShareDT)).slice(0, 10)) {
      try {
        const contents = ((await this.webGet(web, `/students/${web.id}/didactics/${folder.folderId}`, "lettura della didattica")) as { contents?: DidacticsContent[] }).contents ?? [];
        for (const content of contents.filter((entry) => inRange(entry.shareDT))) {
          events.push(dayEvent(`classeviva-doc-${content.contentId}`, `📎 ${folder.folderName}: ${content.contentName}`, content.shareDT!, `Materiale in Didattica: ${content.contentName}`));
        }
      } catch {
        // One folder that cannot be read does not hide the others.
      }
    }
    return events;
  }

  /** Login on the web portal: a session cookie and the student id of the w1 paths. */
  private async webSession(uid: string, password: string): Promise<{ cookie: string; id: string }> {
    const cached = this.webSessions.get(uid);
    if (cached && this.now() < cached.expiresAt) {
      return cached;
    }
    const response = await this.send(WEB_LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": BROWSER_UA,
        Accept: "*/*",
        Referer: "https://web.spaggiari.eu/home/app/default/login.php",
        Origin: "https://web.spaggiari.eu"
      },
      body: new URLSearchParams({ cid: "", uid, pwd: password, pin: "", target: "" }).toString()
    });
    const body = (await this.json(response, "accesso al portale")) as {
      data?: { auth?: { loggedIn?: boolean; errors?: string[]; accountInfo?: { id?: number | string } } };
    };
    if (!body.data?.auth?.loggedIn) {
      throw new ClasseVivaError("auth", `ClasseViva: accesso al portale non riuscito${body.data?.auth?.errors?.length ? ` (${body.data.auth.errors.join(", ")})` : ""}.`);
    }
    const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""];
    const sessionId = setCookies.map((value) => /PHPSESSID=([^;]+)/.exec(value)?.[1]).find(Boolean);
    if (!sessionId) {
      throw new ClasseVivaError("auth", "ClasseViva: il portale non ha aperto la sessione.");
    }
    const session = { cookie: `PHPSESSID=${sessionId}`, id: String(body.data.auth.accountInfo?.id ?? studentId(uid)), expiresAt: this.now() + WEB_SESSION_MS };
    const whoami = (await this.webGet(session, "/misc/whoami", "lettura dell'utente").catch(() => null)) as { id?: string | number } | null;
    if (whoami?.id) {
      session.id = String(whoami.id);
    }
    this.webSessions.set(uid, session);
    return session;
  }

  private async webGet(session: { cookie: string }, path: string, operation: string): Promise<unknown> {
    const response = await this.send(`${W1_URL}${path}`, { method: "GET", headers: { Accept: "application/json", "User-Agent": BROWSER_UA, Cookie: session.cookie } });
    if (response.status === 401 || response.status === 403) {
      // Session closed by the portal: the next request logs in again.
      for (const [uid, cached] of this.webSessions) {
        if (cached.cookie === session.cookie) {
          this.webSessions.delete(uid);
        }
      }
    }
    return this.json(response, operation);
  }

  /** The agenda of the app API, a month at a time (long ranges are refused). */
  private async v1Agenda(credentials: ClasseVivaCredentials, ident: string, from: Date, to: Date): Promise<RemoteEvent[]> {
    const session = await this.session(credentials, ident);
    const entries: AgendaEntry[] = [];
    for (let start = from; start < to; start = new Date(start.getTime() + CHUNK_DAYS * DAY_MS)) {
      const end = new Date(Math.min(to.getTime(), start.getTime() + (CHUNK_DAYS - 1) * DAY_MS));
      const response = await this.send(`${V1_URL}/students/${studentId(session.ident)}/agenda/all/${compactDate(start)}/${compactDate(end)}`, {
        method: "GET",
        headers: { ...APP_HEADERS, "Z-Auth-Token": session.token }
      });
      if (response.status === 401) {
        this.sessions.delete(`${credentials.username}|${ident}`);
      }
      const body = (await this.json(response, "lettura dell'agenda")) as { agenda?: AgendaEntry[] };
      entries.push(...(body.agenda ?? []));
    }
    // A day can be in two months' answers.
    return agendaToEvents([...new Map(entries.map((entry) => [entry.evtId, entry])).values()]);
  }

  private async session(credentials: ClasseVivaCredentials, ident: string) {
    const key = `${credentials.username}|${ident}`;
    const cached = this.sessions.get(key);
    if (cached && this.now() < cached.expiresAt - TOKEN_MARGIN_MS) {
      return cached;
    }
    const login = await this.login(credentials, ident);
    if (!login.token) {
      throw new ClasseVivaError("auth", "ClasseViva non ha concesso l'accesso a questo studente.");
    }
    const session = { token: login.token, ident: login.ident ?? ident, expiresAt: login.expire ? Date.parse(login.expire) : this.now() + 60 * 60 * 1000 };
    this.sessions.set(key, session);
    return session;
  }

  private async login(credentials: ClasseVivaCredentials, ident: string | null): Promise<LoginJson> {
    const response = await this.send(`${V1_URL}/auth/login`, {
      method: "POST",
      headers: APP_HEADERS,
      body: JSON.stringify({ ident, pass: credentials.password, uid: credentials.username })
    });
    if (response.status === 401 || response.status === 422) {
      await response.text();
      throw new ClasseVivaError("auth", "ClasseViva ha rifiutato utente o password.");
    }
    return (await this.json(response, "accesso")) as LoginJson;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new ClasseVivaError("network", "ClasseViva non raggiungibile.");
    }
  }

  private async json(response: Response, operation: string): Promise<unknown> {
    if (!response.ok) {
      // ClasseViva explains the refusal in the body ({"error": "..."}): it is shown with the calendar.
      const detail = (await response.text()).slice(0, 200).replace(/\s+/g, " ").trim();
      throw new ClasseVivaError(response.status === 401 ? "auth" : "http", `ClasseViva: ${operation} non riuscita (HTTP ${response.status})${detail ? `: ${detail}` : ""}.`);
    }
    return response.json();
  }
}
