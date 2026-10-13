import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
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
import {
  MEAL_SLOT_LABELS,
  HOME_CALENDAR_PREFIX,
  MENU_CALENDAR_ID,
  MENU_EVENT_PREFIX,
  OCCASIONS_CALENDAR_ID,
  READ_ONLY_PROVIDERS,
  occasionDate,
  occasionTitle,
  type MenuMeal,
  type Occasion
} from "@familywall/shared";
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
import { FamilyTargetsService } from "./family-targets.service";
import { CalendarCacheRepository } from "./calendar-cache.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { HomeAssistantClient, HomeAssistantError, type HaCalendarEvent } from "../home/home-assistant.client";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 400 * DAY_MS;
/** Calendars are synced in the background for this window around today. */
const SYNC_PAST_DAYS = 31;
const SYNC_FUTURE_DAYS = 183;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
/** Cached events younger than this are served without asking the provider. */
const FRESH_MS = 10 * 60 * 1000;

const syncWindow = (now: Date): { from: Date; to: Date } => {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { from: new Date(today - SYNC_PAST_DAYS * DAY_MS), to: new Date(today + SYNC_FUTURE_DAYS * DAY_MS) };
};

/** Events overlapping [from, to); zero-length events count when they start inside. */
const eventsBetween = (events: RemoteEvent[], from: Date, to: Date): RemoteEvent[] =>
  events.filter((event) => {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    return start < to && (end > from || (end.getTime() === start.getTime() && start >= from));
  });

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

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** An event of a Home Assistant calendar; all-day events travel as UTC midnight like the others. */
export const homeEventToFamily = (calendarId: string, event: HaCalendarEvent, index: number): FamilyEvent | null => {
  const allDay = Boolean(event.start.date && !event.start.dateTime);
  const start = allDay ? new Date(`${event.start.date}T00:00:00.000Z`) : new Date(event.start.dateTime ?? "");
  const end = allDay ? new Date(`${event.end.date ?? event.start.date}T00:00:00.000Z`) : new Date(event.end.dateTime ?? event.start.dateTime ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return {
    id: `${calendarId}:${event.uid ?? index}:${event.recurrence_id ?? start.toISOString()}`,
    calendarId,
    title: event.summary || "Evento",
    startAt: start.toISOString(),
    endAt: (end > start ? end : new Date(start.getTime() + (allDay ? DAY_MS : 60 * 60 * 1000))).toISOString(),
    allDay,
    memberIds: [],
    tagMemberId: null,
    privacy: "shared",
    source: "remote",
    membersInferred: false,
    recurring: Boolean(event.recurrence_id),
    redacted: false,
    notes: event.description ?? null
  };
};

/** Dishes of the family menu as all-day events ("Pranzo: Lasagne"), ingredients in the notes. */
export const menuEvents = (meals: MenuMeal[]): FamilyEvent[] =>
  meals.map((meal) => {
    const start = new Date(`${meal.date}T00:00:00.000Z`);
    return {
      id: MENU_EVENT_PREFIX + meal.id,
      calendarId: MENU_CALENDAR_ID,
      title: `${MEAL_SLOT_LABELS[meal.slot]}: ${meal.title}`,
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + DAY_MS).toISOString(),
      allDay: true,
      memberIds: [],
      tagMemberId: null,
      privacy: "shared",
      source: "local",
      membersInferred: false,
      recurring: false,
      redacted: false,
      notes: meal.ingredients.join("\n") || null
    };
  });

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
export class CalendarsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarsService.name);
  private readonly inFlight = new Map<string, Promise<RemoteEvent[]>>();
  private syncTimer: ReturnType<typeof setInterval> | undefined;
  private firstSync: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly calendars: CalendarsRepository,
    private readonly events: EventsRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly providers: ProvidersService,
    private readonly caldav: CalDavClient,
    private readonly members: MembersRepository,
    private readonly cookidoo: CookidooClient,
    private readonly google: GoogleClient,
    private readonly targets: FamilyTargetsService,
    private readonly cache: CalendarCacheRepository,
    private readonly settings: SettingsRepository,
    private readonly homeAssistant: HomeAssistantClient
  ) {}

  /** Clock, replaceable in tests. */
  public now: () => Date = () => new Date();

  public async getCalendars(viewer: User, range: CalendarRangeInput): Promise<CalendarResponse> {
    const from = range.from ? new Date(range.from) : new Date(Date.now() - 7 * DAY_MS);
    const to = range.to ? new Date(range.to) : new Date(from.getTime() + 60 * DAY_MS);
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw AppException.validation("Intervallo troppo ampio (massimo 400 giorni).");
    }

    // The calendars that hold the family menu and birthdays are shown as those (below), not twice.
    const menuTarget = this.targets.target("menu");
    const occasionsTarget = this.targets.target("occasions");
    const configs = this.calendars.list({ enabledOnly: true }).filter((config) => config.id !== menuTarget?.id && config.id !== occasionsTarget?.id);
    const matchMembers = buildMemberMatcher(this.members.list());
    const stored = this.events.listForCalendars(configs.map((config) => config.id), from.toISOString(), to.toISOString());

    const calendars = await Promise.all(
      configs.map(async (config): Promise<FamilyCalendar> => {
        const rows = stored.filter((row) => row.calendar_id === config.id);
        const { events: remoteEvents, error } = await this.fetchRemote(config, from, to);
        const metaByKey = new Map(rows.filter((row) => row.source === "remote").map((row) => [row.uid, row]));
        const kind =
          config.provider === "classeviva"
            ? "school"
            : config.provider === "cookidoo" || config.purpose === "meals"
              ? "meals"
              : config.purpose === "birthdays"
                ? "birthdays"
                : "events";

        const events = [
          // Menu calendars keep the ingredients in the description, the school register the homework text.
          ...remoteEvents.map((remote) => ({ ...remoteToEvent(config.id, remote, metaByKey), ...(kind === "meals" || kind === "school" ? { notes: remote.description ?? null } : {}) })),
          ...rows.filter((row) => row.source === "local").map(storedToEvent)
        ]
          .map((event) => withInferredMembers(event, matchMembers))
          .map((event) => projectEventForViewer(event, viewer))
          .filter((event): event is FamilyEvent => event !== null)
          .sort((left, right) => left.startAt.localeCompare(right.startAt));

        return { id: config.id, name: config.name, color: config.color, readOnly: READ_ONLY_PROVIDERS.includes(config.provider),
          kind,
          lastError: error,
          events
        };
      })
    );

    // Family menu and birthdays, from the built-in CalDAV server or the calendar chosen for them; shown when
    // they have something (or fail). What is still on the built-in server while a provider calendar is used
    // is shown apart, until the Admin moves it.
    // A day of margin on both sides: menu dates are local, the range is in UTC.
    const fromDate = isoDate(new Date(from.getTime() - DAY_MS));
    const toDate = isoDate(new Date(to.getTime() + DAY_MS));
    const inRange = (meals: MenuMeal[]) =>
      menuEvents(meals.filter((meal) => meal.date >= fromDate && meal.date <= toDate)).filter((event) => new Date(event.startAt) < to && new Date(event.endAt) > from);
    const [meals, occasions, oldMeals, oldOccasions] = await Promise.all([
      this.familyData(() => this.targets.mealsBetween(fromDate, toDate)),
      this.familyData(() => this.targets.occasions()),
      menuTarget ? this.familyData(() => this.targets.menuObjects(null).list()) : Promise.resolve({ items: [] as MenuMeal[], error: null }),
      occasionsTarget ? this.familyData(() => this.targets.occasionObjects(null).list()) : Promise.resolve({ items: [] as Occasion[], error: null })
    ]);
    if (meals.items.length > 0 || meals.error) {
      calendars.push({
        id: MENU_CALENDAR_ID,
        name: menuTarget?.name ?? "Menu di casa",
        color: menuTarget?.color ?? "#EA580C",
        readOnly: true,
        kind: "meals",
        lastError: meals.error,
        events: inRange(meals.items)
      });
    }
    if (oldMeals.items.length > 0) {
      calendars.push({ id: `${MENU_CALENDAR_ID}-internal`, name: "Menu (Familywall)", color: "#EA580C", readOnly: true, kind: "meals", lastError: null, events: inRange(oldMeals.items) });
    }
    if (occasions.items.length > 0 || occasions.error) {
      calendars.push({
        id: OCCASIONS_CALENDAR_ID,
        name: occasionsTarget?.name ?? "Compleanni e ricorrenze",
        color: occasionsTarget?.color ?? "#DB2777",
        readOnly: true,
        kind: "birthdays",
        lastError: occasions.error,
        events: occasionEvents(occasions.items, from, to).map((event) => withInferredMembers(event, matchMembers))
      });
    }
    if (oldOccasions.items.length > 0) {
      calendars.push({
        id: `${OCCASIONS_CALENDAR_ID}-internal`,
        name: "Compleanni (Familywall)",
        color: "#DB2777",
        readOnly: true,
        kind: "birthdays",
        lastError: null,
        events: occasionEvents(oldOccasions.items, from, to).map((event) => withInferredMembers(event, matchMembers))
      });
    }

    calendars.push(...(await this.homeCalendars(viewer, from, to, matchMembers)));

    return { range: { from: from.toISOString(), to: to.toISOString() }, calendars };
  }

  /** Calendars of Home Assistant chosen in Admin: read-only, read live (Home Assistant is on the same network). */
  private async homeCalendars(viewer: User, from: Date, to: Date, matchMembers: (title: string) => string[]): Promise<FamilyCalendar[]> {
    const configs = this.settings.get().homeCalendars ?? [];
    if (configs.length === 0 || !this.homeAssistant.available) {
      return [];
    }
    return Promise.all(
      configs.map(async (config): Promise<FamilyCalendar> => {
        const id = HOME_CALENDAR_PREFIX + config.entityId;
        try {
          const events = (await this.homeAssistant.calendarEvents(config.entityId, from, to))
            .map((event, index) => homeEventToFamily(id, event, index))
            .filter((event): event is FamilyEvent => event !== null)
            .map((event) => withInferredMembers(event, matchMembers))
            .map((event) => projectEventForViewer(event, viewer))
            .filter((event): event is FamilyEvent => event !== null)
            .sort((left, right) => left.startAt.localeCompare(right.startAt));
          return { id, name: config.name, color: config.color, readOnly: true, kind: "events", lastError: null, events };
        } catch (error) {
          const message = error instanceof HomeAssistantError ? error.message : "Home Assistant non disponibile.";
          this.logger.warn(`Reading Home Assistant calendar ${config.entityId} failed: ${message}`);
          return { id, name: config.name, color: config.color, readOnly: true, kind: "events", lastError: message, events: [] };
        }
      })
    );
  }

  private async familyData<T>(read: () => Promise<T[]>): Promise<{ items: T[]; error: string | null }> {
    try {
      return { items: await read(), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore CalDAV.";
      this.logger.warn(`Reading family data failed: ${message}`);
      return { items: [], error: message };
    }
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

  /**
   * Provider events for a range. Ranges inside the sync window come from the cache when it is
   * fresh; otherwise the whole window is read again. A failing provider never hides a calendar:
   * the last synced events are shown with the error, which is also reported per calendar.
   */
  private async fetchRemote(config: CalendarConfig, from: Date, to: Date): Promise<{ events: RemoteEvent[]; error: string | null }> {
    const window = syncWindow(this.now());
    const cached = this.cache.get(config.id);
    const cacheCovers = cached !== undefined && cached.from <= from && cached.to >= to;
    if (cacheCovers && this.now().getTime() - cached.syncedAt.getTime() < FRESH_MS) {
      return { events: eventsBetween(cached.events, from, to), error: null };
    }

    const inWindow = from >= window.from && to <= window.to;
    try {
      if (inWindow) {
        const events = await this.syncCalendar(config, window);
        return { events: eventsBetween(events, from, to), error: null };
      }
      return { events: await this.fetchLive(config, from, to), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto del provider.";
      this.logger.warn(`Fetching calendar ${config.id} failed: ${message}`);
      this.calendars.recordSync(config.id, message);
      if (cached) {
        const time = cached.syncedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: this.timezone() });
        return { events: eventsBetween(cached.events, from, to), error: `${message} Mostro i dati delle ${time}.` };
      }
      return { events: [], error: message };
    }
  }

  /** Reads the sync window from the provider and stores it; concurrent requests share one read. */
  private syncCalendar(config: CalendarConfig, window: { from: Date; to: Date }): Promise<RemoteEvent[]> {
    const running = this.inFlight.get(config.id);
    if (running) {
      return running;
    }
    const work = this.fetchLive(config, window.from, window.to)
      .then((events) => {
        this.cache.put(config.id, window.from, window.to, events, this.now());
        this.calendars.recordSync(config.id, null);
        return events;
      })
      .finally(() => this.inFlight.delete(config.id));
    this.inFlight.set(config.id, work);
    return work;
  }

  private async fetchLive(config: CalendarConfig, from: Date, to: Date): Promise<RemoteEvent[]> {
    // A key mismatch makes decryption throw: it must stay a per-calendar error.
    const credentials = this.accounts.credentials(config.accountId);
    if (!credentials) {
      throw new Error("Account del calendario mancante.");
    }
    return config.provider === "cookidoo"
      ? this.cookidoo.fetchMealPlan(credentials, from, to)
      : config.provider === "classeviva"
        ? this.providers.fetchSchool(credentials, config.remoteUrl, from, to)
      : config.provider === "google"
        ? this.google.fetchEvents(parseGoogleSecret(credentials.password), config.remoteUrl, from, to)
        : this.caldav.fetchEvents(credentials, config.remoteUrl, from, to);
  }

  /** Background sync of every visible calendar, so pages open from the cache. */
  public async syncAll(): Promise<void> {
    const window = syncWindow(this.now());
    for (const config of this.calendars.list({ enabledOnly: true })) {
      const cached = this.cache.get(config.id);
      if (cached && this.now().getTime() - cached.syncedAt.getTime() < FRESH_MS / 2) {
        continue;
      }
      try {
        await this.syncCalendar(config, window);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Errore sconosciuto del provider.";
        this.calendars.recordSync(config.id, message);
        this.logger.warn(`Sync of calendar ${config.id} failed: ${message}`);
      }
    }
  }

  /** After a write the next read goes to the provider again. */
  public invalidate(calendarId: string): void {
    this.cache.invalidate(calendarId);
  }

  public onModuleInit(): void {
    if (process.env.VITEST) {
      return;
    }
    const run = () => void this.syncAll().catch((error: unknown) => this.logger.warn(`Calendar sync failed: ${String(error)}`));
    this.syncTimer = setInterval(run, SYNC_INTERVAL_MS);
    this.firstSync = setTimeout(run, 5_000);
  }

  public onModuleDestroy(): void {
    clearInterval(this.syncTimer);
    clearTimeout(this.firstSync);
  }

  private timezone(): string {
    return this.settings.get().timezone;
  }
}
