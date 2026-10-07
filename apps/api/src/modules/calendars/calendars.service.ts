import { Injectable, Logger } from "@nestjs/common";
import type {
  AddCalendarInput,
  CalendarConfig,
  CalendarRangeInput,
  CalendarResponse,
  FamilyCalendar,
  FamilyEvent,
  RemoteCalendar,
  UpdateCalendarInput,
  User
} from "@familywall/shared";
import { OCCASIONS_CALENDAR_ID, READ_ONLY_PROVIDERS, occasionDate, occasionTitle, type Occasion } from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { CalDavClient } from "../providers/caldav/caldav-client";
import { CookidooClient } from "../providers/cookidoo/cookidoo-client";
import { GoogleClient, parseGoogleSecret } from "../providers/google/google-client";
import type { RemoteEvent } from "../providers/caldav/ics-parser";
import { ProviderAccountsRepository } from "../providers/provider-accounts.repository";
import { ProvidersService } from "../providers/providers.service";
import { CalendarsRepository } from "./calendars.repository";
import { encodeRemoteEventId, remoteMetaKey } from "./event-ids";
import { projectEventForViewer } from "./event-visibility";
import { buildMemberMatcher } from "./member-matcher";
import { MembersRepository } from "../members/members.repository";
import { EventsRepository, type StoredEvent } from "./events.repository";
import { OccasionsRepository } from "./occasions.repository";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 400 * DAY_MS;

export const storedToEvent = (row: StoredEvent): FamilyEvent => ({
  id: row.id,
  calendarId: row.calendar_id,
  title: row.title ?? "",
  startAt: row.start_at ?? "",
  endAt: row.end_at ?? "",
  allDay: row.all_day === 1,
  memberIds: row.memberIds,
  tagMemberId: row.tag_member_id,
  privacy: row.privacy,
  source: "local",
  membersInferred: false,
  recurring: false,
  redacted: false
});

/** Occurrence-specific metadata wins over the series metadata. */
const remoteToEvent = (calendarId: string, remote: RemoteEvent, metaByKey: Map<string, StoredEvent>): FamilyEvent => {
  const meta =
    (remote.occurrenceKey ? metaByKey.get(remoteMetaKey(remote.uid, remote.occurrenceKey, "occurrence")) : undefined) ??
    metaByKey.get(remote.uid);

  return {
    id: encodeRemoteEventId({ calendarId, uid: remote.uid, occurrenceKey: remote.occurrenceKey }),
    calendarId,
    title: remote.title,
    startAt: remote.startAt,
    endAt: remote.endAt,
    allDay: remote.allDay,
    memberIds: meta?.memberIds ?? [],
    tagMemberId: meta?.tag_member_id ?? null,
    privacy: meta?.privacy ?? "shared",
    source: "remote",
    membersInferred: false,
    recurring: remote.occurrenceKey !== "",
    redacted: false
  };
};

/** Events without members assigned in the app get the members named in their title (before privacy is applied). */
const withInferredMembers = (event: FamilyEvent, matchMembers: (title: string) => string[]): FamilyEvent => {
  if (event.memberIds.length > 0) {
    return event;
  }
  const memberIds = matchMembers(event.title);
  return memberIds.length > 0 ? { ...event, memberIds, membersInferred: true } : event;
};

/** One all-day event per occasion and year in the range (all-day events travel as UTC midnight). */
export const occasionEvents = (occasions: Occasion[], from: Date, to: Date): FamilyEvent[] =>
  occasions.flatMap((occasion) => {
    const events: FamilyEvent[] = [];
    for (let year = from.getFullYear(); year <= to.getFullYear(); year += 1) {
      const date = occasionDate(occasion, year);
      const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const end = new Date(start.getTime() + DAY_MS);
      if (start < to && end > from) {
        events.push({
          id: `occ_${occasion.id}_${year}`,
          calendarId: OCCASIONS_CALENDAR_ID,
          title: occasionTitle(occasion, year),
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          allDay: true,
          memberIds: [],
          tagMemberId: null,
          privacy: "shared",
          source: "local",
          membersInferred: false,
          recurring: false,
          redacted: false
        });
      }
    }
    return events;
  });

@Injectable()
export class CalendarsService {
  private readonly logger = new Logger(CalendarsService.name);

  public constructor(
    private readonly calendars: CalendarsRepository,
    private readonly events: EventsRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly providers: ProvidersService,
    private readonly caldav: CalDavClient,
    private readonly members: MembersRepository,
    private readonly cookidoo: CookidooClient,
    private readonly google: GoogleClient,
    private readonly occasions: OccasionsRepository
  ) {}

  public async getCalendars(viewer: User, range: CalendarRangeInput): Promise<CalendarResponse> {
    const from = range.from ? new Date(range.from) : new Date(Date.now() - 7 * DAY_MS);
    const to = range.to ? new Date(range.to) : new Date(from.getTime() + 60 * DAY_MS);
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw AppException.validation("Intervallo troppo ampio (massimo 400 giorni).");
    }

    const configs = this.calendars.list({ enabledOnly: true });
    const matchMembers = buildMemberMatcher(this.members.list());
    const stored = this.events.listForCalendars(configs.map((config) => config.id), from.toISOString(), to.toISOString());

    const calendars = await Promise.all(
      configs.map(async (config): Promise<FamilyCalendar> => {
        const rows = stored.filter((row) => row.calendar_id === config.id);
        const { events: remoteEvents, error } = await this.fetchRemote(config, from, to);
        const metaByKey = new Map(rows.filter((row) => row.source === "remote").map((row) => [row.uid, row]));

        const events = [
          ...remoteEvents.map((remote) => remoteToEvent(config.id, remote, metaByKey)),
          ...rows.filter((row) => row.source === "local").map(storedToEvent)
        ]
          .map((event) => withInferredMembers(event, matchMembers))
          .map((event) => projectEventForViewer(event, viewer))
          .filter((event): event is FamilyEvent => event !== null)
          .sort((left, right) => left.startAt.localeCompare(right.startAt));

        return { id: config.id, name: config.name, color: config.color, readOnly: READ_ONLY_PROVIDERS.includes(config.provider),
          kind: config.provider === "cookidoo" ? "meals" : config.purpose === "birthdays" ? "birthdays" : "events",
          lastError: error,
          events
        };
      })
    );

    const occasions = this.occasions.list();
    if (occasions.length > 0) {
      calendars.push({
        id: OCCASIONS_CALENDAR_ID,
        name: "Compleanni e ricorrenze",
        color: "#DB2777",
        readOnly: true,
        kind: "birthdays",
        lastError: null,
        events: occasionEvents(occasions, from, to).map((event) => withInferredMembers(event, matchMembers))
      });
    }

    return { range: { from: from.toISOString(), to: to.toISOString() }, calendars };
  }

  public listConfigs(): CalendarConfig[] {
    return this.calendars.list();
  }

  public discover(accountId: string): Promise<RemoteCalendar[]> {
    return this.providers.discover(accountId, this.calendars.remoteUrlsForAccount(accountId));
  }

  public add(input: AddCalendarInput): CalendarConfig {
    if (!this.accounts.findById(input.accountId)) {
      throw AppException.notFound("Account non trovato.");
    }
    if (this.calendars.remoteUrlsForAccount(input.accountId).has(input.remoteUrl)) {
      throw AppException.conflict("Questo calendario è già stato aggiunto.");
    }
    return this.calendars.insert(input);
  }

  public update(calendarId: string, input: UpdateCalendarInput): CalendarConfig {
    this.requireCalendar(calendarId);
    return this.calendars.update(calendarId, input);
  }

  public delete(calendarId: string): void {
    this.requireCalendar(calendarId);
    this.calendars.delete(calendarId);
  }

  public requireCalendar(calendarId: string): CalendarConfig {
    const calendar = this.calendars.findById(calendarId);
    if (!calendar) {
      throw AppException.notFound("Calendario non trovato.");
    }
    return calendar;
  }

  /** A failing provider must not hide the other calendars: the error is reported per calendar. */
  private async fetchRemote(config: CalendarConfig, from: Date, to: Date): Promise<{ events: RemoteEvent[]; error: string | null }> {
    try {
      // Inside the try: a key mismatch makes decryption throw, which must stay a per-calendar error.
      const credentials = this.accounts.credentials(config.accountId);
      if (!credentials) {
        return { events: [], error: "Account del calendario mancante." };
      }

      const events =
        config.provider === "cookidoo"
          ? await this.cookidoo.fetchMealPlan(credentials, from, to)
          : config.provider === "google"
            ? await this.google.fetchEvents(parseGoogleSecret(credentials.password), config.remoteUrl, from, to)
            : await this.caldav.fetchEvents(credentials, config.remoteUrl, from, to);
      this.calendars.recordSync(config.id, null);
      return { events, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto del provider.";
      this.logger.warn(`Fetching calendar ${config.id} failed: ${message}`);
      this.calendars.recordSync(config.id, message);
      return { events: [], error: message };
    }
  }
}
