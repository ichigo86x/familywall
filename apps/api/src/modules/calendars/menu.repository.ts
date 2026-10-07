import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { MealSlot, MenuMeal } from "@familywall/shared";
import { DATABASE, nowIso, type Database } from "../../database/database";

interface MenuMealRow {
  id: string;
  date: string;
  slot: MealSlot;
  title: string;
  ingredients: string;
  note: string | null;
}

export interface MenuMealFields {
  date: string;
  slot: MealSlot;
  title: string;
  ingredients: string[];
  note: string | null;
}

const SLOT_ORDER = "CASE slot WHEN 'colazione' THEN 0 WHEN 'pranzo' THEN 1 WHEN 'merenda' THEN 2 ELSE 3 END";

const toMeal = (row: MenuMealRow): MenuMeal => ({
  id: row.id,
  date: row.date,
  slot: row.slot,
  title: row.title,
  ingredients: JSON.parse(row.ingredients) as string[],
  note: row.note
});

@Injectable()
export class MenuRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Dishes between two local dates (both included). */
  public between(from: string, to: string): MenuMeal[] {
    return (
      this.db.prepare(`SELECT * FROM menu_meals WHERE date >= ? AND date <= ? ORDER BY date, ${SLOT_ORDER}, created_at`).all(from, to) as unknown as MenuMealRow[]
    ).map(toMeal);
  }

  public findById(id: string): MenuMeal | undefined {
    const row = this.db.prepare("SELECT * FROM menu_meals WHERE id = ?").get(id) as MenuMealRow | undefined;
    return row ? toMeal(row) : undefined;
  }

  public insert(fields: MenuMealFields): MenuMeal {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare("INSERT INTO menu_meals (id, date, slot, title, ingredients, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, fields.date, fields.slot, fields.title, JSON.stringify(fields.ingredients), fields.note, now, now);
    return this.findById(id)!;
  }

  public update(id: string, fields: MenuMealFields): MenuMeal {
    this.db
      .prepare("UPDATE menu_meals SET date = ?, slot = ?, title = ?, ingredients = ?, note = ?, updated_at = ? WHERE id = ?")
      .run(fields.date, fields.slot, fields.title, JSON.stringify(fields.ingredients), fields.note, nowIso(), id);
    return this.findById(id)!;
  }

  public delete(id: string): void {
    this.db.prepare("DELETE FROM menu_meals WHERE id = ?").run(id);
  }
}
