import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import type { ScheduleEntryResponse, ScheduleResponse } from "@familywall/shared";
import { scheduleEntrySchema } from "@familywall/shared";
import type { z } from "zod";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ScheduleStore } from "../dav/family-stores";
import { MembersRepository } from "../members/members.repository";

type ScheduleInput = z.output<typeof scheduleEntrySchema>;

/** Everyone sees the shifts; Admins and Parents organise them. They live in the "Turni" CalDAV collection. */
@Controller("schedule")
export class ScheduleController {
  public constructor(
    private readonly schedule: ScheduleStore,
    private readonly members: MembersRepository
  ) {}

  @Get()
  @RequirePermission("calendar:read")
  public async list(): Promise<ScheduleResponse> {
    return { entries: await this.schedule.list() };
  }

  @Post()
  @RequirePermission("events:write")
  public async create(@Body(new ZodValidationPipe(scheduleEntrySchema)) input: ScheduleInput): Promise<ScheduleEntryResponse> {
    this.assertMember(input.memberId);
    return { entry: await this.schedule.create(input) };
  }

  @Patch(":entryId")
  @RequirePermission("events:write")
  public async update(@Param("entryId") entryId: string, @Body(new ZodValidationPipe(scheduleEntrySchema)) input: ScheduleInput): Promise<ScheduleEntryResponse> {
    this.assertMember(input.memberId);
    return { entry: await this.schedule.update(entryId, input) };
  }

  @Delete(":entryId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("events:write")
  public async delete(@Param("entryId") entryId: string): Promise<void> {
    await this.schedule.delete(entryId);
  }

  private assertMember(memberId: string | null): void {
    if (memberId && !this.members.findById(memberId)) {
      throw AppException.validation("Membro inesistente.");
    }
  }
}
