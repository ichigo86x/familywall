import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { menuMealSchema, menuRangeSchema, type MenuIngredientsResponse, type MenuMeal, type MenuMealsResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CookidooClient, cookidooRecipeId } from "../providers/cookidoo/cookidoo-client";
import { ProviderAccountsRepository } from "../providers/provider-accounts.repository";
import { CalendarsRepository } from "./calendars.repository";
import { decodeRemoteEventId } from "./event-ids";
import { MenuRepository, type MenuMealFields } from "./menu.repository";

const MAX_INGREDIENT_LOOKUPS = 30;

/** The family menu kept in Familywall, and the ingredients of Cookidoo recipes. */
@Controller("menu")
export class MenuController {
  public constructor(
    private readonly menu: MenuRepository,
    private readonly calendars: CalendarsRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly cookidoo: CookidooClient
  ) {}

  @Get()
  @RequirePermission("calendar:read")
  public list(@Query(new ZodValidationPipe(menuRangeSchema)) range: { from: string; to: string }): MenuMealsResponse {
    return { meals: this.menu.between(range.from, range.to) };
  }

  @Post()
  @RequirePermission("events:write")
  public create(@Body(new ZodValidationPipe(menuMealSchema)) input: MenuMealFields): { meal: MenuMeal } {
    return { meal: this.menu.insert(input) };
  }

  @Patch(":id")
  @RequirePermission("events:write")
  public update(@Param("id") id: string, @Body(new ZodValidationPipe(menuMealSchema)) input: MenuMealFields): { meal: MenuMeal } {
    this.require(id);
    return { meal: this.menu.update(id, input) };
  }

  @Delete(":id")
  @RequirePermission("events:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(@Param("id") id: string): void {
    this.require(id);
    this.menu.delete(id);
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

  private require(id: string): void {
    if (!this.menu.findById(id)) {
      throw AppException.notFound("Piatto non trovato.");
    }
  }
}
