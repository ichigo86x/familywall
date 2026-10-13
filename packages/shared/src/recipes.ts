import { z } from "zod";
import { MEAL_SLOTS, ingredientKey, type MealSlot, type MenuMeal } from "./menu";

/** A dish the family makes, with its ingredients: reused when planning the menu. */
export interface Recipe {
  id: string;
  title: string;
  /** Usual meal, or null for any. */
  slot: MealSlot | null;
  ingredients: string[];
  note: string | null;
}

export interface RecipesResponse {
  recipes: Recipe[];
}

export const recipeSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slot: z.enum(["colazione", "pranzo", "merenda", "cena"]).nullable().default(null),
  ingredients: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
  note: z.string().trim().max(500).nullable().default(null)
});

export type RecipeInput = z.input<typeof recipeSchema>;

/** A dish proposed for an empty meal of the period. */
export interface MenuSuggestion {
  date: string;
  slot: MealSlot;
  title: string;
  ingredients: string[];
  /** "recipe": from the recipes; "history": cooked before. */
  source: "recipe" | "history";
}

export interface MenuSuggestionsResponse {
  suggestions: MenuSuggestion[];
}

export const menuSuggestionsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slots: z
    .string()
    .default("cena")
    .transform((value) => value.split(",").filter((slot): slot is MealSlot => (MEAL_SLOTS as readonly string[]).includes(slot)))
});

/** The same dish is not proposed again within this many days of the last time. */
export const SUGGESTION_GAP_DAYS = 7;

const DAY_MS = 86_400_000;
const dayNumber = (date: string): number => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dateOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

interface Candidate {
  title: string;
  ingredients: string[];
  slots: Set<MealSlot>;
  count: number;
  source: "recipe" | "history";
  days: number[];
}

/**
 * Fills the empty meals between from and to (both included, the slots asked) with the dishes the family
 * cooks most often and its recipes: a dish is not repeated within SUGGESTION_GAP_DAYS, dishes usual for
 * that meal come first, then the most frequent, then the ones not cooked for the longest time.
 */
export const suggestMenu = (meals: MenuMeal[], recipes: Recipe[], from: string, to: string, slots: MealSlot[]): MenuSuggestion[] => {
  const candidates = new Map<string, Candidate>();
  const add = (title: string, ingredients: string[], slot: MealSlot | null, source: "recipe" | "history", date?: string) => {
    const key = ingredientKey(title);
    if (!key) {
      return;
    }
    const entry = candidates.get(key) ?? { title: title.trim(), ingredients, slots: new Set<MealSlot>(), count: 0, source, days: [] };
    if (slot) {
      entry.slots.add(slot);
    }
    if (source === "recipe") {
      entry.source = "recipe";
      entry.title = title.trim();
      entry.ingredients = ingredients.length > 0 ? ingredients : entry.ingredients;
    } else {
      entry.count += 1;
      entry.days.push(dayNumber(date!));
      if (entry.ingredients.length === 0) {
        entry.ingredients = ingredients;
      }
    }
    candidates.set(key, entry);
  };
  for (const recipe of recipes) {
    add(recipe.title, recipe.ingredients, recipe.slot, "recipe");
  }
  for (const meal of meals) {
    add(meal.title, meal.ingredients, meal.slot, "history", meal.date);
  }

  const taken = new Set(meals.map((meal) => `${meal.date}|${meal.slot}`));
  const suggestions: MenuSuggestion[] = [];
  for (let day = dayNumber(from); day <= dayNumber(to); day += 1) {
    for (const slot of slots) {
      if (taken.has(`${dateOf(day)}|${slot}`)) {
        continue;
      }
      const usable = [...candidates.values()].filter(
        (candidate) => (candidate.slots.size === 0 || candidate.slots.has(slot)) && candidate.days.every((used) => Math.abs(used - day) >= SUGGESTION_GAP_DAYS)
      );
      const lastUsed = (candidate: Candidate) => Math.max(-Infinity, ...candidate.days.filter((used) => used < day));
      usable.sort(
        (left, right) =>
          Number(right.slots.has(slot)) - Number(left.slots.has(slot)) ||
          right.count - left.count ||
          lastUsed(left) - lastUsed(right) ||
          left.title.localeCompare(right.title)
      );
      const chosen = usable[0];
      if (!chosen) {
        continue;
      }
      chosen.days.push(day);
      suggestions.push({ date: dateOf(day), slot, title: chosen.title, ingredients: chosen.ingredients, source: chosen.source });
    }
  }
  return suggestions;
};
