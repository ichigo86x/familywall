import { Inject, Injectable } from "@nestjs/common";
import type { HouseholdSettings, UpdateSettingsInput } from "@familywall/shared";
import { DATABASE, type Database } from "../../database/database";

const DEFAULTS: HouseholdSettings = {
  householdName: "Famiglia",
  locale: "it-IT",
  timezone: "Europe/Rome",
  wallModeEnabled: true
};

@Injectable()
export class SettingsRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public get(): HouseholdSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    const stored = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value) as unknown]));
    return { ...DEFAULTS, ...(stored as Partial<HouseholdSettings>) };
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
