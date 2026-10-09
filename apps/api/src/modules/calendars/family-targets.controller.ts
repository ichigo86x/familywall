import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { setFamilyTargetSchema, type FamilyDataKind, type FamilyTargetsResponse, type SetFamilyTargetResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { FamilyTargetsService } from "./family-targets.service";

/** Where menu and birthdays are kept (built-in server or a provider calendar), and moving them. */
@Controller("family-targets")
export class FamilyTargetsController {
  public constructor(private readonly targets: FamilyTargetsService) {}

  @Get()
  @RequirePermission("providers:manage")
  public async list(): Promise<FamilyTargetsResponse> {
    const [menu, occasions] = await Promise.all([this.targets.info("menu"), this.targets.info("occasions")]);
    return { menu, occasions };
  }

  @Put(":kind")
  @RequirePermission("providers:manage")
  public set(
    @Param("kind") kind: string,
    @Body(new ZodValidationPipe(setFamilyTargetSchema)) input: { target: string | null; move: boolean }
  ): Promise<SetFamilyTargetResponse> {
    if (kind !== "menu" && kind !== "occasions") {
      throw AppException.notFound("Tipo di dati non valido.");
    }
    return this.targets.setTarget(kind as FamilyDataKind, input.target, input.move);
  }
}
