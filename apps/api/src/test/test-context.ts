import { randomBytes } from "node:crypto";
import { SecretBox } from "../common/crypto/secret-box";
import { openDatabase } from "../database/database";
import { AuthService } from "../modules/auth/auth.service";
import { TotpService } from "../modules/auth/totp.service";
import { CalendarsRepository } from "../modules/calendars/calendars.repository";
import { CalendarsService } from "../modules/calendars/calendars.service";
import { EventsRepository } from "../modules/calendars/events.repository";
import { EventsService } from "../modules/calendars/events.service";
import { CalendarCacheRepository } from "../modules/calendars/calendar-cache.repository";
import { FamilyTargetsService } from "../modules/calendars/family-targets.service";
import { LegacyDataMigration } from "../modules/dav/legacy-migration";
import { MenuStore, NotesStore, OccasionsStore, RoutinesStore, ScheduleStore } from "../modules/dav/family-stores";
import { MembersRepository } from "../modules/members/members.repository";
import { MembersService } from "../modules/members/members.service";
import { CalDavClient } from "../modules/providers/caldav/caldav-client";
import { CookidooClient } from "../modules/providers/cookidoo/cookidoo-client";
import { GoogleClient } from "../modules/providers/google/google-client";
import { ProviderAccountsRepository } from "../modules/providers/provider-accounts.repository";
import { ProvidersService } from "../modules/providers/providers.service";
import { SettingsRepository } from "../modules/settings/settings.repository";
import { MemoryDavStore } from "./memory-dav-store";
import { IcloudBridge } from "../modules/providers/icloud-web/icloud-bridge";
import { HomeAssistantClient } from "../modules/home/home-assistant.client";

/** Wires the services by hand on an in-memory database, mirroring the Nest modules. */
export const createTestContext = (
  caldav: CalDavClient = new CalDavClient(async () => new Response("", { status: 500 })),
  cookidoo: CookidooClient = new CookidooClient(async () => new Response("", { status: 500 })),
  google: GoogleClient = new GoogleClient(async () => new Response("", { status: 500 }))
) => {
  const db = openDatabase(":memory:");
  const secrets = new SecretBox(randomBytes(32));
  const membersRepository = new MembersRepository(db);
  const settings = new SettingsRepository(db);
  const accounts = new ProviderAccountsRepository(db, secrets);
  const calendarsRepository = new CalendarsRepository(db);
  const eventsRepository = new EventsRepository(db);
  const providers = new ProvidersService(accounts, caldav, cookidoo, google, new IcloudBridge({ python: "", port: 0, sessionDir: "" }));
  const dav = new MemoryDavStore();
  const homeAssistant = new HomeAssistantClient(null);
  const occasions = new OccasionsStore(dav, settings);
  const cache = new CalendarCacheRepository(db);
  const menu = new MenuStore(dav, settings);
  const notes = new NotesStore(dav, settings);
  const schedule = new ScheduleStore(dav, settings, membersRepository);
  const targets = new FamilyTargetsService(calendarsRepository, accounts, caldav, google, settings, menu, occasions);
  const calendars = new CalendarsService(calendarsRepository, eventsRepository, accounts, providers, caldav, membersRepository, cookidoo, google, targets, cache, settings, homeAssistant);

  return {
    db,
    secrets,
    settings,
    accounts,
    calendarsRepository,
    eventsRepository,
    membersRepository,
    members: new MembersService(membersRepository),
    auth: new AuthService(db, randomBytes(32), membersRepository, settings, new TotpService(secrets, membersRepository, settings)),
    totp: new TotpService(secrets, membersRepository, settings),
    providers,
    dav,
    occasions,
    cache,
    menu,
    targets,
    notes,
    schedule,
    routines: new RoutinesStore(dav, settings, membersRepository),
    migration: new LegacyDataMigration(db, occasions, menu, schedule, notes),
    calendars,
    events: new EventsService(eventsRepository, calendars, membersRepository, accounts, caldav, settings, google)
  };
};
