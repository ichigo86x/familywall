import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { recipeSchema, type Recipe, type RecipesResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RecipeFields } from "../dav/family-ics";
import { RecipesStore } from "../dav/family-stores";

/** Recipes of the family on the built-in CalDAV server ("Ricette"), reused when planning the menu. */
@Controller("recipes")
export class RecipesController {
  public constructor(private readonly recipes: RecipesStore) {}

  @Get()
  @RequirePermission("calendar:read")
  public async list(): Promise<RecipesResponse> {
    return { recipes: await this.recipes.list() };
  }

  @Post()
  @RequirePermission("events:write")
  public async create(@Body(new ZodValidationPipe(recipeSchema)) input: RecipeFields): Promise<{ recipe: Recipe }> {
    return { recipe: await this.recipes.create(input) };
  }

  @Patch(":id")
  @RequirePermission("events:write")
  public async update(@Param("id") id: string, @Body(new ZodValidationPipe(recipeSchema)) input: RecipeFields): Promise<{ recipe: Recipe }> {
    return { recipe: await this.recipes.update(id, input) };
  }

  @Delete(":id")
  @RequirePermission("events:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(@Param("id") id: string): Promise<void> {
    await this.recipes.delete(id);
  }
}
