import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import type { ScheduleEntryResponse, ScheduleResponse } from "@familywall/shared";
import { canTickChore, choreDoneSchema, scheduleAppliesOn, scheduleEntrySchema, type ChoreDoneInput } from "@familywall/shared";
import type { z } from "zod";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { ScheduleStore } from "../dav/family-stores";
import { MembersRepository } from "../members/members.repository";
import { SettingsRepository } from "../settings/settings.repository";

type ScheduleInput = z.output<typeof scheduleEntrySchema>;

/** Chores can be ticked for today and the past week. */
const TICK_DAYS_BACK = 6;

/** Today in the household timezone, as YYYY-MM-DD. */
export const localToday = (timezone: string): string => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Everyone sees the shifts; Admins and Parents organise them. They live in the "Turni" CalDAV collection. */
@Controller("schedule")
export class ScheduleController {
  public constructor(
    private readonly schedule: ScheduleStore,
    private readonly members: MembersRepository,
    private readonly settings: SettingsRepository
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

  /** A chore done (or undone) on a day: the child it belongs to, parents and wall panels may tick it. */
  @Post(":entryId/done")
  @RequirePermission("calendar:read")
  public async done(
    @Req() request: RequestWithUser,
    @Param("entryId") entryId: string,
    @Body(new ZodValidationPipe(choreDoneSchema)) input: ChoreDoneInput
  ): Promise<ScheduleEntryResponse> {
    const entry = await this.schedule.find(entryId);
    if (!entry) {
      throw AppException.notFound("Turno non trovato.");
    }
    if (!canTickChore(request.user, entry)) {
      throw AppException.forbidden("Puoi spuntare solo le tue faccende.");
    }
    const today = localToday(this.settings.get().timezone);
    const [year, month, day] = input.date.split("-").map(Number) as [number, number, number];
    const date = new Date(year, month - 1, day);
    const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
    const daysBack = Math.round((new Date(ty, tm - 1, td).getTime() - date.getTime()) / 86_400_000);
    if (daysBack < 0 || daysBack > TICK_DAYS_BACK || !scheduleAppliesOn(entry, date)) {
      throw AppException.validation("Questa faccenda non si può spuntare per quel giorno.");
    }
    return { entry: await this.schedule.setDone(entryId, input.date, input.done) };
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
