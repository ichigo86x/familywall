import { Inject, Injectable, Logger } from "@nestjs/common";
import type { MealSlot, OccasionKind, ScheduleKind, WeekParity } from "@familywall/shared";
import { DATABASE, type Database } from "../../database/database";
import { MenuStore, NotesStore, OccasionsStore, ScheduleStore } from "./family-stores";

interface Counted {
  occasions: number;
  menu: number;
  schedule: number;
  notes: number;
}

/**
 * Up to version 0.3 menu, birthdays, shifts and notes lived in the database. They now live on
 * the built-in CalDAV server: at every start (and after restoring an old backup) the rows
 * still in the old tables are written there, with the same ids, and then deleted. A move cut
 * short is completed the next time, overwriting the copies already written.
 */
@Injectable()
export class LegacyDataMigration {
  private readonly logger = new Logger("Migration");
  private running: Promise<Counted> | null = null;

  public constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly occasions: OccasionsStore,
    private readonly menu: MenuStore,
    private readonly schedule: ScheduleStore,
    private readonly notes: NotesStore
  ) {}

  /** Rows still waiting in the old tables. */
  public pending(): number {
    return ["occasions", "menu_meals", "schedule_entries", "notes"].reduce(
      (total, table) => total + (this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count,
      0
    );
  }

  public run(): Promise<Counted> {
    this.running ??= this.move().finally(() => (this.running = null));
    return this.running;
  }

  private async move(): Promise<Counted> {
    const counted: Counted = { occasions: 0, menu: 0, schedule: 0, notes: 0 };
    if (this.pending() === 0) {
      return counted;
    }

    const occasions = this.db.prepare("SELECT * FROM occasions").all() as unknown as Array<{
      id: string;
      name: string;
      kind: OccasionKind;
      month: number;
      day: number;
      year: number | null;
      updated_at: string;
    }>;
    for (const row of occasions) {
      await this.occasions.create({ name: row.name, kind: row.kind, month: row.month, day: row.day, year: row.year }, { id: row.id, now: new Date(row.updated_at) });
      this.db.prepare("DELETE FROM occasions WHERE id = ?").run(row.id);
      counted.occasions += 1;
    }

    const meals = this.db.prepare("SELECT * FROM menu_meals").all() as unknown as Array<{
      id: string;
      date: string;
      slot: MealSlot;
      title: string;
      ingredients: string;
      note: string | null;
      updated_at: string;
    }>;
    for (const row of meals) {
      await this.menu.create(
        { date: row.date, slot: row.slot, title: row.title, ingredients: JSON.parse(row.ingredients) as string[], note: row.note },
        { id: row.id, now: new Date(row.updated_at) }
      );
      this.db.prepare("DELETE FROM menu_meals WHERE id = ?").run(row.id);
      counted.menu += 1;
    }

    const entries = this.db.prepare("SELECT * FROM schedule_entries").all() as unknown as Array<{
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
      updated_at: string;
    }>;
    for (const row of entries) {
      await this.schedule.create(
        {
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
        },
        { id: row.id, now: new Date(row.updated_at) }
      );
      this.db.prepare("DELETE FROM schedule_entries WHERE id = ?").run(row.id);
      counted.schedule += 1;
    }

    const notes = this.db.prepare("SELECT * FROM notes").all() as unknown as Array<{
      id: string;
      title: string;
      body: string;
      color: string;
      pinned: number;
      on_dashboard: number;
      created_by: string | null;
      updated_at: string;
    }>;
    for (const row of notes) {
      await this.notes.create(
        { title: row.title, body: row.body, color: row.color, pinned: row.pinned === 1, onDashboard: row.on_dashboard === 1, createdBy: row.created_by },
        { id: row.id, now: new Date(row.updated_at) }
      );
      this.db.prepare("DELETE FROM notes WHERE id = ?").run(row.id);
      counted.notes += 1;
    }

    this.logger.log(
      `Moved to the CalDAV server: ${counted.occasions} occasions, ${counted.menu} dishes, ${counted.schedule} shifts, ${counted.notes} notes.`
    );
    return counted;
  }
}
