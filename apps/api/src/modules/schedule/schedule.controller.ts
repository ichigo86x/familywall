import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import type { ScheduleEntryResponse, ScheduleResponse } from "@familywall/shared";
import { scheduleEntrySchema } from "@familywall/shared";
import type { z } from "zod";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { MembersRepository } from "../members/members.repository";
import { ScheduleRepository } from "./schedule.repository";

type ScheduleInput = z.output<typeof scheduleEntrySchema>;

/** Everyone sees the shifts; Admins and Parents organise them. */
@Controller("schedule")
export class ScheduleController {
  public constructor(
    private readonly schedule: ScheduleRepository,
    private readonly members: MembersRepository
  ) {}

  @Get()
  @RequirePermission("calendar:read")
  public list(): ScheduleResponse {
    return { entries: this.schedule.list() };
  }

  @Post()
  @RequirePermission("events:write")
  public create(@Body(new ZodValidationPipe(scheduleEntrySchema)) input: ScheduleInput): ScheduleEntryResponse {
    this.assertMember(input.memberId);
    return { entry: this.schedule.insert(input) };
  }

  @Patch(":entryId")
  @RequirePermission("events:write")
  public update(@Param("entryId") entryId: string, @Body(new ZodValidationPipe(scheduleEntrySchema)) input: ScheduleInput): ScheduleEntryResponse {
    this.requireEntry(entryId);
    this.assertMember(input.memberId);
    return { entry: this.schedule.update(entryId, input) };
  }

  @Delete(":entryId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("events:write")
  public delete(@Param("entryId") entryId: string): void {
    this.requireEntry(entryId);
    this.schedule.delete(entryId);
  }

  private requireEntry(entryId: string): void {
    if (!this.schedule.findById(entryId)) {
      throw AppException.notFound("Turno non trovato.");
    }
  }

  private assertMember(memberId: string | null): void {
    if (memberId && !this.members.findById(memberId)) {
      throw AppException.validation("Membro inesistente.");
    }
  }
}
