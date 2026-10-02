import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { CreateEventInput, DeleteEventQuery, EventResponse, UpdateEventInput } from "@familywall/shared";
import { createEventSchema, deleteEventQuerySchema, updateEventSchema } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { EventsService } from "./events.service";

@Controller("events")
@RequirePermission("events:write")
export class EventsController {
  public constructor(private readonly eventsService: EventsService) {}

  @Post()
  public async create(
    @Req() request: RequestWithUser,
    @Body(new ZodValidationPipe(createEventSchema)) input: CreateEventInput
  ): Promise<EventResponse> {
    return { event: await this.eventsService.create(request.user, input) };
  }

  /** Returns only the id: provider events are re-read through GET /calendars. */
  @Patch(":eventId")
  public update(
    @Req() request: RequestWithUser,
    @Param("eventId") eventId: string,
    @Body(new ZodValidationPipe(updateEventSchema)) input: UpdateEventInput
  ): Promise<{ id: string }> {
    return this.eventsService.update(request.user, eventId, input);
  }

  @Delete(":eventId")
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(
    @Param("eventId") eventId: string,
    @Query(new ZodValidationPipe(deleteEventQuerySchema)) query: DeleteEventQuery
  ): Promise<void> {
    return this.eventsService.delete(eventId, query.scope);
  }
}
