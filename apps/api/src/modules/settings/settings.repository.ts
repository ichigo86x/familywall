import { Inject, Injectable } from "@nestjs/common";
import type { HouseholdSettings, UpdateSettingsInput } from "@familywall/shared";
import { DATABASE, type Database } from "../../database/database";

const DEFAULTS: HouseholdSettings = {
  householdName: "Famiglia",
  locale: "it-IT",
  timezone: "Europe/Rome",
  wallModeEnabled: true,
  dashboardListIds: [],
  weatherLocation: null,
  panelNight: { enabled: false, start: "23:00", end: "06:30" },
  homeButtons: [],
  homeLists: [],
  homeCalendars: [],
  panelProfiles: {},
  homePresence: [],
  menuCalendarId: null,
  occasionsCalendarId: null
};

@Injectable()
export class SettingsRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public get(): HouseholdSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    const stored = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value) as unknown]));
    return { ...DEFAULTS, ...(stored as Partial<HouseholdSettings>) };
  }

  /** Where menu or birthdays are kept: changed only through the family targets (which also move the data). */
  public setFamilyTarget(key: "menuCalendarId" | "occasionsCalendarId", value: string | null): HouseholdSettings {
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
    return this.get();
  }

  public update(patch: UpdateSettingsInput): HouseholdSettings {
    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"
    );
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined && key in DEFAULTS) {
        upsert.run(key, JSON.stringify(value));
      }
    }
    return this.get();
  }
}
