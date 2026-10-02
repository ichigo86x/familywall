import { Body, Controller, Get, Patch } from "@nestjs/common";
import type { HouseholdSettings, UpdateSettingsInput } from "@familywall/shared";
import { updateSettingsSchema } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SettingsRepository } from "./settings.repository";

@Controller("settings")
export class SettingsController {
  public constructor(private readonly settings: SettingsRepository) {}

  @Get()
  public get(): HouseholdSettings {
    return this.settings.get();
  }

  @Patch()
  @RequirePermission("settings:manage")
  public update(@Body(new ZodValidationPipe(updateSettingsSchema)) input: UpdateSettingsInput): HouseholdSettings {
    return this.settings.update(input);
  }
}
