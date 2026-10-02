import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import type { CreateEventInput, EventResponse, UpdateEventInput } from "@familywall/shared";
import { createEventSchema, updateEventSchema } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { EventsService } from "./events.service";

@Controller("events")
@RequirePermission("events:write")
export class EventsController {
  public constructor(private readonly eventsService: EventsService) {}

  @Post()
  public create(
    @Req() request: RequestWithUser,
    @Body(new ZodValidationPipe(createEventSchema)) input: CreateEventInput
  ): EventResponse {
    return { event: this.eventsService.create(request.user, input) };
  }

  /** Returns only the id: provider events are re-read through GET /calendars. */
  @Patch(":eventId")
  public update(
    @Req() request: RequestWithUser,
    @Param("eventId") eventId: string,
    @Body(new ZodValidationPipe(updateEventSchema)) input: UpdateEventInput
  ): { id: string } {
    return this.eventsService.update(request.user, eventId, input);
  }

  @Delete(":eventId")
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(@Param("eventId") eventId: string): void {
    this.eventsService.delete(eventId);
  }
}
