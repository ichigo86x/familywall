import { Injectable } from "@nestjs/common";
import type { CreateEventInput, FamilyEvent, UpdateEventInput, User } from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { MembersRepository } from "../members/members.repository";
import { CalendarsService, storedToEvent } from "./calendars.service";
import { decodeRemoteEventId } from "./event-ids";
import { EventsRepository } from "./events.repository";

@Injectable()
export class EventsService {
  public constructor(
    private readonly events: EventsRepository,
    private readonly calendars: CalendarsService,
    private readonly members: MembersRepository
  ) {}

  public create(actor: User, input: CreateEventInput): FamilyEvent {
    this.requireWritableCalendar(input.calendarId);
    this.assertMembersExist(input.memberIds, input.tagMemberId);

    return storedToEvent(
      this.events.insertLocal(input.calendarId, actor.id, {
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay,
        privacy: input.privacy,
        tagMemberId: input.tagMemberId,
        memberIds: input.memberIds
      })
    );
  }

  /**
   * Local events are fully editable. Provider events accept only app metadata
   * (members, tag, privacy) until write-back to the provider is implemented.
   */
  public update(actor: User, eventId: string, input: UpdateEventInput): { id: string } {
    this.assertMembersExist(input.memberIds ?? [], input.tagMemberId ?? null);

    const remote = decodeRemoteEventId(eventId);
    if (remote) {
      this.requireWritableCalendar(remote.calendarId);
      const touchesProviderFields = [input.title, input.startAt, input.endAt, input.allDay].some((value) => value !== undefined);
      if (touchesProviderFields) {
        throw AppException.conflict("Titolo e orario degli eventi del provider non sono ancora modificabili dall'app.");
      }

      this.events.upsertRemoteMeta(remote.calendarId, remote.uid, actor.id, {
        privacy: input.privacy,
        tagMemberId: input.tagMemberId,
        memberIds: input.memberIds
      });
      return { id: eventId };
    }

    const current = this.events.findById(eventId);
    if (!current || current.source !== "local") {
      throw AppException.notFound("Evento non trovato.");
    }

    const startAt = input.startAt ?? current.start_at!;
    const endAt = input.endAt ?? current.end_at!;
    if (new Date(endAt) <= new Date(startAt)) {
      throw AppException.validation("La fine deve essere dopo l'inizio.");
    }

    return { id: this.events.update(eventId, input).id };
  }

  public delete(eventId: string): void {
    if (decodeRemoteEventId(eventId)) {
      throw AppException.conflict("Gli eventi del provider non sono ancora eliminabili dall'app.");
    }

    const current = this.events.findById(eventId);
    if (!current || current.source !== "local") {
      throw AppException.notFound("Evento non trovato.");
    }
    this.events.delete(eventId);
  }

  private requireWritableCalendar(calendarId: string): void {
    const calendar = this.calendars.requireCalendar(calendarId);
    if (!calendar.enabled) {
      throw AppException.conflict("Il calendario è disattivato.");
    }
  }

  private assertMembersExist(memberIds: string[], tagMemberId: string | null): void {
    const ids = [...new Set([...memberIds, ...(tagMemberId ? [tagMemberId] : [])])];
    const existing = this.members.existingIds(ids);
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw AppException.validation("L'evento fa riferimento a membri inesistenti.", { missing });
    }
  }
}
