import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Occasion, OccasionKind } from "@familywall/shared";
import { DATABASE, nowIso, type Database } from "../../database/database";

interface OccasionRow {
  id: string;
  name: string;
  kind: OccasionKind;
  month: number;
  day: number;
  year: number | null;
}

export interface OccasionFields {
  name: string;
  kind: OccasionKind;
  month: number;
  day: number;
  year: number | null;
}

const toOccasion = (row: OccasionRow): Occasion => ({ id: row.id, name: row.name, kind: row.kind, month: row.month, day: row.day, year: row.year });

@Injectable()
export class OccasionsRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public list(): Occasion[] {
    return (this.db.prepare("SELECT * FROM occasions ORDER BY month, day, name").all() as unknown as OccasionRow[]).map(toOccasion);
  }

  public findById(id: string): Occasion | undefined {
    const row = this.db.prepare("SELECT * FROM occasions WHERE id = ?").get(id) as OccasionRow | undefined;
    return row ? toOccasion(row) : undefined;
  }

  public insert(fields: OccasionFields): Occasion {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare("INSERT INTO occasions (id, name, kind, month, day, year, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, fields.name, fields.kind, fields.month, fields.day, fields.year, now, now);
    return this.findById(id)!;
  }

  public update(id: string, fields: OccasionFields): Occasion {
    this.db
      .prepare("UPDATE occasions SET name = ?, kind = ?, month = ?, day = ?, year = ?, updated_at = ? WHERE id = ?")
      .run(fields.name, fields.kind, fields.month, fields.day, fields.year, nowIso(), id);
    return this.findById(id)!;
  }

  public delete(id: string): void {
    this.db.prepare("DELETE FROM occasions WHERE id = ?").run(id);
  }
}
