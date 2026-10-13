import { Inject, Injectable } from "@nestjs/common";
import { DEFAULT_PHOTO_SETTINGS, type HouseholdSettings, type UpdateSettingsInput } from "@familywall/shared";
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
  photos: DEFAULT_PHOTO_SETTINGS,
  menuCalendarId: null,
  occasionsCalendarId: null
};

@Injectable()
export class SettingsRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public get(): HouseholdSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    // Only settings: other rows (encrypted keys, see secret()) never leave the server.
    const stored = Object.fromEntries(rows.filter((row) => row.key in DEFAULTS).map((row) => [row.key, JSON.parse(row.value) as unknown]));
    return { ...DEFAULTS, ...(stored as Partial<HouseholdSettings>) };
  }

  /** Where menu or birthdays are kept: changed only through the family targets (which also move the data). */
  public setFamilyTarget(key: "menuCalendarId" | "occasionsCalendarId", value: string | null): HouseholdSettings {
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
    return this.get();
  }

  /** A value kept apart from the settings (already encrypted by the caller), never sent to the clients. */
  public secret(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(`secret:${key}`) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as string) : null;
  }

  public setSecret(key: string, value: string | null): void {
    if (value === null) {
      this.db.prepare("DELETE FROM settings WHERE key = ?").run(`secret:${key}`);
      return;
    }
    this.db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(`secret:${key}`, JSON.stringify(value));
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
