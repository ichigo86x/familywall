import { z } from "zod";

export type MealSlot = "colazione" | "pranzo" | "merenda" | "cena";

export const MEAL_SLOTS: readonly MealSlot[] = ["colazione", "pranzo", "merenda", "cena"];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = { colazione: "Colazione", pranzo: "Pranzo", merenda: "Merenda", cena: "Cena" };

/** A dish of the family menu kept in Familywall. */
export interface MenuMeal {
  id: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  slot: MealSlot;
  title: string;
  /** One ingredient per entry, e.g. "200 g di pasta". */
  ingredients: string[];
  note: string | null;
}

export interface MenuMealsResponse {
  meals: MenuMeal[];
}

/** Id of the virtual calendar that carries the family menu in GET /calendars. */
export const MENU_CALENDAR_ID = "menu";
export const MENU_EVENT_PREFIX = "meal_";

export const menuMealSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  slot: z.enum(["colazione", "pranzo", "merenda", "cena"]),
  title: z.string().trim().min(1).max(120),
  ingredients: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
  note: z.string().trim().max(500).nullable().default(null)
});

export type MenuMealInput = z.input<typeof menuMealSchema>;

export const menuRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

/** Ingredients of Cookidoo recipes, by event id (null when Cookidoo does not give them). */
export interface MenuIngredientsResponse {
  ingredients: Record<string, string[] | null>;
}

/**
 * Ingredients written in an event description (menu calendars): one per line,
 * list bullets and an optional "Ingredienti:" heading are dropped.
 */
export const ingredientsFromText = (text: string | null | undefined): string[] =>
  (text ?? "")
    .split(/\r?\n|;/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0 && !/^ingredienti\s*:?$/i.test(line))
    .slice(0, 60);

/** Same ingredient written twice (case and spaces aside) is added once. */
export const ingredientKey = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");
