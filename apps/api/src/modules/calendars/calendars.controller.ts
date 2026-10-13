import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type {
  AddCalendarInput,
  CalendarConfigResponse,
  CalendarConfigsResponse,
  CalendarRangeInput,
  CalendarResponse,
  RemoteCalendarsResponse,
  UpdateCalendarInput
} from "@familywall/shared";
import { addCalendarSchema, calendarRangeSchema, updateCalendarSchema } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { CalendarsService } from "./calendars.service";

@Controller("calendars")
export class CalendarsController {
  public constructor(private readonly calendarsService: CalendarsService) {}

  @Get()
  @RequirePermission("calendar:read")
  public getCalendars(
    @Req() request: RequestWithUser,
    @Query(new ZodValidationPipe(calendarRangeSchema)) range: CalendarRangeInput
  ): Promise<CalendarResponse> {
    return this.calendarsService.getCalendars(request.user, range);
  }

  /** Homework and tests of the school registers, apart from the family's events. */
  @Get("school")
  @RequirePermission("calendar:read")
  public getSchool(@Query(new ZodValidationPipe(calendarRangeSchema)) range: CalendarRangeInput): Promise<CalendarResponse> {
    return this.calendarsService.getSchool(range);
  }

  @Get("config")
  @RequirePermission("providers:manage")
  public listConfigs(): CalendarConfigsResponse {
    return { calendars: this.calendarsService.listConfigs() };
  }

  @Get("discover/:accountId")
  @RequirePermission("providers:manage")
  public async discover(@Param("accountId") accountId: string): Promise<RemoteCalendarsResponse> {
    return { calendars: await this.calendarsService.discover(accountId) };
  }

  @Post()
  @RequirePermission("providers:manage")
  public add(@Body(new ZodValidationPipe(addCalendarSchema)) input: AddCalendarInput): CalendarConfigResponse {
    return { calendar: this.calendarsService.add(input) };
  }

  @Patch(":calendarId")
  @RequirePermission("providers:manage")
  public update(
    @Param("calendarId") calendarId: string,
    @Body(new ZodValidationPipe(updateCalendarSchema)) input: UpdateCalendarInput
  ): CalendarConfigResponse {
    return { calendar: this.calendarsService.update(calendarId, input) };
  }

  @Delete(":calendarId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("providers:manage")
  public delete(@Param("calendarId") calendarId: string): void {
    this.calendarsService.delete(calendarId);
  }
}
