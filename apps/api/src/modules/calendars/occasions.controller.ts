import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { occasionSchema, type Occasion, type OccasionsResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { OccasionFields } from "../dav/family-ics";
import { FamilyTargetsService } from "./family-targets.service";

/** Birthdays and anniversaries (built-in CalDAV server or the calendar chosen for them; also a virtual calendar). */
@Controller("occasions")
export class OccasionsController {
  public constructor(private readonly targets: FamilyTargetsService) {}

  @Get()
  @RequirePermission("calendar:read")
  public async list(): Promise<OccasionsResponse> {
    return { occasions: await this.targets.occasions() };
  }

  @Post()
  @RequirePermission("events:write")
  public async create(@Body(new ZodValidationPipe(occasionSchema)) input: OccasionFields): Promise<{ occasion: Occasion }> {
    return { occasion: await this.targets.occasionObjects().create(input) };
  }

  @Patch(":id")
  @RequirePermission("events:write")
  public async update(@Param("id") id: string, @Body(new ZodValidationPipe(occasionSchema)) input: OccasionFields): Promise<{ occasion: Occasion }> {
    return { occasion: await this.targets.occasionObjects().update(id, input) };
  }

  @Delete(":id")
  @RequirePermission("events:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(@Param("id") id: string): Promise<void> {
    await this.targets.occasionObjects().delete(id);
  }
}
