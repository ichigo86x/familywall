import { describe, expect, it } from "vitest";
import { suggestMenu, type MenuMeal, type Recipe } from "@familywall/shared";
import { createTestContext } from "../../test/test-context";
import { RecipesStore } from "../dav/family-stores";

const meal = (date: string, title: string, slot: MenuMeal["slot"] = "cena"): MenuMeal => ({ id: `${date}-${title}`, date, slot, title, ingredients: [], note: null });

describe("Recipes", () => {
  it("keeps recipes on the CalDAV server with ingredients, usual meal and note", async () => {
    const ctx = createTestContext();
    const recipes = new RecipesStore(ctx.dav, ctx.settings);
    const lasagne = await recipes.create({ title: "Lasagne", slot: "pranzo", ingredients: ["sfoglia", "ragù"], note: "Domenica" });
    await recipes.create({ title: "Frittata", slot: null, ingredients: ["uova"], note: null });

    expect(await recipes.list()).toMatchObject([
      { title: "Frittata", slot: null, ingredients: ["uova"], note: null },
      { id: lasagne.id, title: "Lasagne", slot: "pranzo", ingredients: ["sfoglia", "ragù"], note: "Domenica" }
    ]);
  });
});

describe("suggestMenu", () => {
  it("fills empty meals with frequent dishes and recipes, without repeating within a week", () => {
    const history = [meal("2026-09-20", "Pizza"), meal("2026-09-27", "Pizza"), meal("2026-10-04", "Pizza"), meal("2026-10-01", "Minestrone")];
    const recipes: Recipe[] = [{ id: "r1", title: "Frittata", slot: null, ingredients: ["uova"], note: null }];
    const planned = [meal("2026-10-13", "Risotto")];

    const suggestions = suggestMenu([...history, ...planned], recipes, "2026-10-12", "2026-10-15", ["cena"]);

    expect(suggestions.map((entry) => [entry.date, entry.title, entry.source])).toEqual([
      ["2026-10-12", "Pizza", "history"],
      // 13: already planned.
      ["2026-10-14", "Minestrone", "history"],
      ["2026-10-15", "Frittata", "recipe"]
    ]);
    expect(suggestions[2]!.ingredients).toEqual(["uova"]);
  });

  it("keeps dishes to their usual meal", () => {
    const recipes: Recipe[] = [{ id: "r1", title: "Cornetto", slot: "colazione", ingredients: [], note: null }];
    expect(suggestMenu([], recipes, "2026-10-12", "2026-10-12", ["cena"])).toEqual([]);
  });
});
