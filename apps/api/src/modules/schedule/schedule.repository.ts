import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ScheduleEntry, ScheduleKind, WeekParity } from "@familywall/shared";
import { DATABASE, nowIso, type Database } from "../../database/database";

interface ScheduleRow {
  id: string;
  kind: ScheduleKind;
  title: string;
  member_id: string | null;
  person: string | null;
  weekdays: string;
  week_parity: WeekParity;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
}

export type ScheduleData = Omit<ScheduleEntry, "id">;

const toEntry = (row: ScheduleRow): ScheduleEntry => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  memberId: row.member_id,
  person: row.person,
  weekdays: JSON.parse(row.weekdays) as number[],
  weekParity: row.week_parity,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  note: row.note
});

/** Household shifts: who works where, children's chores, people visiting the house. */
@Injectable()
export class ScheduleRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public list(): ScheduleEntry[] {
    return (this.db.prepare("SELECT * FROM schedule_entries ORDER BY kind, start_time, title").all() as unknown as ScheduleRow[]).map(toEntry);
  }

  public findById(id: string): ScheduleEntry | undefined {
    const row = this.db.prepare("SELECT * FROM schedule_entries WHERE id = ?").get(id) as ScheduleRow | undefined;
    return row ? toEntry(row) : undefined;
  }

  public insert(data: ScheduleData): ScheduleEntry {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO schedule_entries (id, kind, title, member_id, person, weekdays, week_parity, date, start_time, end_time, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, ...this.values(data), now, now);
    return this.findById(id)!;
  }

  public update(id: string, data: ScheduleData): ScheduleEntry {
    this.db
      .prepare(
        `UPDATE schedule_entries
         SET kind = ?, title = ?, member_id = ?, person = ?, weekdays = ?, week_parity = ?, date = ?, start_time = ?, end_time = ?, note = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(...this.values(data), nowIso(), id);
    return this.findById(id)!;
  }

  public delete(id: string): void {
    this.db.prepare("DELETE FROM schedule_entries WHERE id = ?").run(id);
  }

  private values(data: ScheduleData): Array<string | null> {
    return [
      data.kind,
      data.title,
      data.memberId,
      data.person?.trim() || null,
      JSON.stringify([...new Set(data.weekdays)].sort()),
      data.weekParity,
      data.date,
      data.startTime,
      data.endTime,
      data.note?.trim() || null
    ];
  }
}
