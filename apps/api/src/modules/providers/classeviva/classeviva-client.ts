import { CalDavError, type CalDavErrorKind } from "../caldav/caldav-client";
import type { RemoteEvent } from "../caldav/ics-parser";

/**
 * Read-only client for the ClasseViva (Spaggiari) school register: homework, tests and notes of the agenda.
 *
 * Spaggiari has no public API: this uses the REST API of the official mobile app, as documented by the
 * community (github.com/Lioydiano/Classeviva-Official-Endpoints). It may stop working if Spaggiari changes it.
 * Parents with more children get one identity per child ("choices"); each becomes a calendar.
 */

const BASE_URL = "https://web.spaggiari.eu/rest/v1";
/** The app's headers: requests without them are refused. */
const APP_HEADERS = { "User-Agent": "CVVS/std/4.2.3 Android/12", "Z-Dev-Apikey": "Tg1NWEwNGIgIC0K", "Content-Type": "application/json" };
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
/** Days per agenda request. */
const CHUNK_DAYS = 31;
/** Remote URL of a ClasseViva calendar: one per identity (student, or parent of one child). */
const URL_PREFIX = "classeviva://";

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

interface AgendaJson {
  agenda?: Array<{
    evtId: number;
    evtCode: string;
    evtDatetimeBegin: string;
    evtDatetimeEnd: string;
    isFullDay: boolean;
    notes: string | null;
    authorName: string | null;
    subjectDesc: string | null;
  }>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const classeVivaUrl = (ident: string): string => `${URL_PREFIX}${ident}`;
export const isClasseVivaUrl = (url: string): boolean => url.startsWith(URL_PREFIX);
const identOf = (url: string): string => url.slice(URL_PREFIX.length);
/** "S1234567X" or "G1234567X" → "1234567": the student id of the API paths. */
const studentId = (ident: string): string => ident.replace(/\D/g, "");
const compactDate = (date: Date): string => date.toISOString().slice(0, 10).replace(/-/g, "");

/** Homework ("AGHW") is shown on its day; other agenda entries (tests, notes) keep their times. */
export const agendaToEvents = (agenda: NonNullable<AgendaJson["agenda"]>): RemoteEvent[] =>
  agenda.map((entry) => {
    const homework = entry.evtCode === "AGHW";
    const subject = entry.subjectDesc ? entry.subjectDesc.charAt(0) + entry.subjectDesc.slice(1).toLowerCase() : (entry.authorName ?? "Scuola");
    const notes = (entry.notes ?? "").trim();
    const allDay = homework || entry.isFullDay;
    const day = entry.evtDatetimeBegin.slice(0, 10);
    const nextDay = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString();
    return {
      uid: `classeviva-${entry.evtId}`,
      occurrenceKey: "",
      title: `${homework ? "📚" : "📝"} ${subject}${notes ? `: ${notes.split("\n")[0]!.slice(0, 120)}` : ""}`,
      startAt: allDay ? `${day}T00:00:00.000Z` : new Date(entry.evtDatetimeBegin).toISOString(),
      endAt: allDay ? nextDay : new Date(entry.evtDatetimeEnd).toISOString(),
      allDay,
      ...(notes ? { description: notes } : {})
    };
  });

export class ClasseVivaClient {
  private readonly sessions = new Map<string, { token: string; ident: string; expiresAt: number }>();

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

  /** The agenda is read a month at a time, like the app does: long ranges are refused by ClasseViva. */
  public async fetchEvents(credentials: ClasseVivaCredentials, remoteUrl: string, from: Date, to: Date): Promise<RemoteEvent[]> {
    const session = await this.session(credentials, identOf(remoteUrl));
    const entries: NonNullable<AgendaJson["agenda"]> = [];
    for (let start = from; start < to; start = new Date(start.getTime() + CHUNK_DAYS * 86_400_000)) {
      const end = new Date(Math.min(to.getTime(), start.getTime() + (CHUNK_DAYS - 1) * 86_400_000));
      const response = await this.send(`${BASE_URL}/students/${studentId(session.ident)}/agenda/all/${compactDate(start)}/${compactDate(end)}`, {
        method: "GET",
        headers: { ...APP_HEADERS, "Z-Auth-Token": session.token }
      });
      if (response.status === 401) {
        this.sessions.delete(`${credentials.username}|${identOf(remoteUrl)}`);
      }
      const body = (await this.json(response, "lettura dell'agenda")) as AgendaJson;
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
    const response = await this.send(`${BASE_URL}/auth/login`, {
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
