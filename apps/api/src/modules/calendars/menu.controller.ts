import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { menuMealSchema, menuRangeSchema, menuSuggestionsQuerySchema, suggestMenu, type MealSlot, type MenuSuggestionsResponse, type MenuIngredientsResponse, type MenuMeal, type MenuMealsResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CookidooClient, cookidooRecipeId } from "../providers/cookidoo/cookidoo-client";
import { ProviderAccountsRepository } from "../providers/provider-accounts.repository";
import { CalendarsRepository } from "./calendars.repository";
import { decodeRemoteEventId } from "./event-ids";
import type { MenuMealFields } from "../dav/family-ics";
import { FamilyTargetsService } from "./family-targets.service";
import { RecipesStore } from "../dav/family-stores";

const MAX_INGREDIENT_LOOKUPS = 30;
/** Suggestions look at the dishes of the last months. */
const HISTORY_DAYS = 120;

/** The family menu (built-in CalDAV server or the calendar chosen for it), and the ingredients of Cookidoo recipes. */
@Controller("menu")
export class MenuController {
  public constructor(
    private readonly targets: FamilyTargetsService,
    private readonly recipes: RecipesStore,
    private readonly calendars: CalendarsRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly cookidoo: CookidooClient
  ) {}

  @Get()
  @RequirePermission("calendar:read")
  public async list(@Query(new ZodValidationPipe(menuRangeSchema)) range: { from: string; to: string }): Promise<MenuMealsResponse> {
    return { meals: await this.targets.mealsBetween(range.from, range.to) };
  }

  /** Dishes for the empty meals of a period, from the recipes and what the family cooked in the last months. */
  @Get("suggestions")
  @RequirePermission("calendar:read")
  public async suggestions(
    @Query(new ZodValidationPipe(menuSuggestionsQuerySchema)) query: { from: string; to: string; slots: MealSlot[] }
  ): Promise<MenuSuggestionsResponse> {
    const since = new Date(Date.parse(`${query.from}T00:00:00Z`) - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [meals, recipes] = await Promise.all([this.targets.mealsBetween(since, query.to), this.recipes.list().catch(() => [])]);
    return { suggestions: suggestMenu(meals, recipes, query.from, query.to, query.slots.length > 0 ? query.slots : ["cena"]) };
  }

  @Post()
  @RequirePermission("events:write")
  public async create(@Body(new ZodValidationPipe(menuMealSchema)) input: MenuMealFields): Promise<{ meal: MenuMeal }> {
    return { meal: await this.targets.menuObjects().create(input) };
  }

  @Patch(":id")
  @RequirePermission("events:write")
  public async update(@Param("id") id: string, @Body(new ZodValidationPipe(menuMealSchema)) input: MenuMealFields): Promise<{ meal: MenuMeal }> {
    return { meal: await this.targets.menuObjects().update(id, input) };
  }

  @Delete(":id")
  @RequirePermission("events:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(@Param("id") id: string): Promise<void> {
    await this.targets.menuObjects().delete(id);
  }

  /** Ingredients of Cookidoo meal events (ids from GET /calendars); null when Cookidoo does not give them. */
  @Get("ingredients")
  @RequirePermission("calendar:read")
  public async ingredients(@Query("ids") ids?: string): Promise<MenuIngredientsResponse> {
    const eventIds = [...new Set(String(ids ?? "").split(",").filter(Boolean))].slice(0, MAX_INGREDIENT_LOOKUPS);
    const result: Record<string, string[] | null> = {};
    for (const eventId of eventIds) {
      result[eventId] = await this.cookidooIngredients(eventId);
    }
    return { ingredients: result };
  }

  private async cookidooIngredients(eventId: string): Promise<string[] | null> {
    const remote = decodeRemoteEventId(eventId);
    const calendar = remote ? this.calendars.findById(remote.calendarId) : undefined;
    const recipeId = remote ? cookidooRecipeId(remote.uid) : null;
    if (!remote || !calendar || calendar.provider !== "cookidoo" || !recipeId) {
      return null;
    }
    try {
      const credentials = this.accounts.credentials(calendar.accountId);
      if (!credentials?.serverUrl) {
        return null;
      }
      const ingredients = await this.cookidoo.recipeIngredients({ ...credentials, serverUrl: credentials.serverUrl }, recipeId);
      return ingredients.length > 0 ? ingredients : null;
    } catch {
      return null;
    }
  }
}
