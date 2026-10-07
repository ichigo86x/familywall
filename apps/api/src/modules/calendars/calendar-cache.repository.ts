import { Inject, Injectable } from "@nestjs/common";
import { DATABASE, type Database } from "../../database/database";
import type { RemoteEvent } from "../providers/caldav/ics-parser";

export interface CachedCalendar {
  from: Date;
  to: Date;
  events: RemoteEvent[];
  syncedAt: Date;
}

interface CacheRow {
  window_from: string;
  window_to: string;
  events_json: string;
  synced_at: string;
}

/** Last provider events read for each calendar, so the wall keeps working when a provider is slow or down. */
@Injectable()
export class CalendarCacheRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public get(calendarId: string): CachedCalendar | undefined {
    const row = this.db.prepare("SELECT * FROM calendar_cache WHERE calendar_id = ?").get(calendarId) as CacheRow | undefined;
    return row
      ? { from: new Date(row.window_from), to: new Date(row.window_to), events: JSON.parse(row.events_json) as RemoteEvent[], syncedAt: new Date(row.synced_at) }
      : undefined;
  }

  public put(calendarId: string, from: Date, to: Date, events: RemoteEvent[], syncedAt: Date): void {
    this.db
      .prepare(
        `INSERT INTO calendar_cache (calendar_id, window_from, window_to, events_json, synced_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (calendar_id) DO UPDATE SET window_from = excluded.window_from, window_to = excluded.window_to,
           events_json = excluded.events_json, synced_at = excluded.synced_at`
      )
      .run(calendarId, from.toISOString(), to.toISOString(), JSON.stringify(events), syncedAt.toISOString());
  }

  public invalidate(calendarId: string): void {
    this.db.prepare("DELETE FROM calendar_cache WHERE calendar_id = ?").run(calendarId);
  }
}
