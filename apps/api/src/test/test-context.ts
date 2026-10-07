import { randomBytes } from "node:crypto";
import { SecretBox } from "../common/crypto/secret-box";
import { openDatabase } from "../database/database";
import { AuthService } from "../modules/auth/auth.service";
import { CalendarsRepository } from "../modules/calendars/calendars.repository";
import { CalendarsService } from "../modules/calendars/calendars.service";
import { EventsRepository } from "../modules/calendars/events.repository";
import { EventsService } from "../modules/calendars/events.service";
import { OccasionsRepository } from "../modules/calendars/occasions.repository";
import { CalendarCacheRepository } from "../modules/calendars/calendar-cache.repository";
import { MembersRepository } from "../modules/members/members.repository";
import { MembersService } from "../modules/members/members.service";
import { CalDavClient } from "../modules/providers/caldav/caldav-client";
import { CookidooClient } from "../modules/providers/cookidoo/cookidoo-client";
import { GoogleClient } from "../modules/providers/google/google-client";
import { ProviderAccountsRepository } from "../modules/providers/provider-accounts.repository";
import { ProvidersService } from "../modules/providers/providers.service";
import { SettingsRepository } from "../modules/settings/settings.repository";

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
  const providers = new ProvidersService(accounts, caldav, cookidoo, google);
  const occasions = new OccasionsRepository(db);
  const cache = new CalendarCacheRepository(db);
  const calendars = new CalendarsService(calendarsRepository, eventsRepository, accounts, providers, caldav, membersRepository, cookidoo, google, occasions, cache, settings);

  return {
    db,
    secrets,
    settings,
    accounts,
    calendarsRepository,
    eventsRepository,
    membersRepository,
    members: new MembersService(membersRepository),
    auth: new AuthService(db, randomBytes(32), membersRepository, settings),
    providers,
    occasions,
    cache,
    calendars,
    events: new EventsService(eventsRepository, calendars, membersRepository, accounts, caldav, settings, google)
  };
};
