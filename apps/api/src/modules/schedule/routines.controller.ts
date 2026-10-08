import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import type { RoutineResponse, RoutinesResponse } from "@familywall/shared";
import { canTickChore, routineSchema, routineStepDoneSchema, type RoutineStepDoneInput } from "@familywall/shared";
import type { z } from "zod";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { RoutinesStore } from "../dav/family-stores";
import { MembersRepository } from "../members/members.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { localToday } from "./schedule.controller";

type RoutineInput = z.output<typeof routineSchema>;

/** Morning and evening routines: Admins and Parents set them up, children tick the steps (on the panel too). */
@Controller("routines")
export class RoutinesController {
  public constructor(
    private readonly routines: RoutinesStore,
    private readonly members: MembersRepository,
    private readonly settings: SettingsRepository
  ) {}

  @Get()
  @RequirePermission("calendar:read")
  public async list(): Promise<RoutinesResponse> {
    return { routines: await this.routines.list() };
  }

  @Post()
  @RequirePermission("events:write")
  public async create(@Body(new ZodValidationPipe(routineSchema)) input: RoutineInput): Promise<RoutineResponse> {
    this.assertMember(input.memberId);
    return { routine: await this.routines.create(input) };
  }

  @Patch(":id")
  @RequirePermission("events:write")
  public async update(@Param("id") id: string, @Body(new ZodValidationPipe(routineSchema)) input: RoutineInput): Promise<RoutineResponse> {
    this.assertMember(input.memberId);
    return { routine: await this.routines.update(id, input) };
  }

  /** One step done (or undone) today: same rule as chores (own routine, parents, panels). */
  @Post(":id/steps")
  @RequirePermission("calendar:read")
  public async step(
    @Req() request: RequestWithUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(routineStepDoneSchema)) input: RoutineStepDoneInput
  ): Promise<RoutineResponse> {
    const routine = await this.routines.find(id);
    if (!routine) {
      throw AppException.notFound("Routine non trovata.");
    }
    if (!canTickChore(request.user, { kind: "chore", memberId: routine.memberId ?? request.user.id })) {
      throw AppException.forbidden("Puoi spuntare solo la tua routine.");
    }
    if (input.date !== localToday(this.settings.get().timezone) || input.step >= routine.steps.length) {
      throw AppException.validation("Si spuntano solo i passi di oggi.");
    }
    return { routine: await this.routines.setStep(id, input.date, input.step, input.done) };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("events:write")
  public async delete(@Param("id") id: string): Promise<void> {
    await this.routines.delete(id);
  }

  private assertMember(memberId: string | null): void {
    if (memberId && !this.members.findById(memberId)) {
      throw AppException.validation("Membro inesistente.");
    }
  }
}
