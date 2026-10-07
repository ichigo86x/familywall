import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { occasionSchema, type Occasion, type OccasionsResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { OccasionsRepository, type OccasionFields } from "./occasions.repository";

/** Birthdays and anniversaries kept in Familywall (they also appear as a virtual calendar). */
@Controller("occasions")
export class OccasionsController {
  public constructor(private readonly occasions: OccasionsRepository) {}

  @Get()
  @RequirePermission("calendar:read")
  public list(): OccasionsResponse {
    return { occasions: this.occasions.list() };
  }

  @Post()
  @RequirePermission("events:write")
  public create(@Body(new ZodValidationPipe(occasionSchema)) input: OccasionFields): { occasion: Occasion } {
    return { occasion: this.occasions.insert(input) };
  }

  @Patch(":id")
  @RequirePermission("events:write")
  public update(@Param("id") id: string, @Body(new ZodValidationPipe(occasionSchema)) input: OccasionFields): { occasion: Occasion } {
    this.require(id);
    return { occasion: this.occasions.update(id, input) };
  }

  @Delete(":id")
  @RequirePermission("events:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(@Param("id") id: string): void {
    this.require(id);
    this.occasions.delete(id);
  }

  private require(id: string): void {
    if (!this.occasions.findById(id)) {
      throw AppException.notFound("Ricorrenza non trovata.");
    }
  }
}
