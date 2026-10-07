import { Injectable } from "@nestjs/common";
import { READ_ONLY_PROVIDERS } from "@familywall/shared";
import type { CreateEventInput, FamilyEvent, RecurrenceScope, UpdateEventInput, User } from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { MembersRepository } from "../members/members.repository";
import { CalDavClient, CalDavError, eventResourceUrl, type CalDavCredentials } from "../providers/caldav/caldav-client";
import { applyEventDelete, applyEventEdit, buildEventIcs, newEventUid, rruleText } from "../providers/caldav/ics-editor";
import { GoogleClient, parseGoogleSecret, type GoogleSecret } from "../providers/google/google-client";
import { ProviderAccountsRepository } from "../providers/provider-accounts.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { CalendarsService } from "./calendars.service";
import { decodeRemoteEventId, encodeRemoteEventId, remoteMetaKey, type RemoteEventRef } from "./event-ids";
import { EventsRepository } from "./events.repository";

const providerError = (error: unknown): AppException => {
  if (error instanceof AppException) {
    return error;
  }
  if (error instanceof CalDavError) {
    if (error.kind === "conflict") {
      return AppException.conflict(error.message);
    }
    if (error.kind === "forbidden") {
      return AppException.forbidden(error.message);
    }
    return AppException.providerError(error.message);
  }
  return AppException.providerError(error instanceof Error ? error.message : "Errore del provider.");
};

/**
 * Event writes go to the provider (iCloud/CalDAV) first; app-only metadata
 * (members, tag, privacy) is stored afterwards in the local database.
 */
@Injectable()
export class EventsService {
  public constructor(
    private readonly events: EventsRepository,
    private readonly calendars: CalendarsService,
    private readonly members: MembersRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly caldav: CalDavClient,
    private readonly settings: SettingsRepository,
    private readonly google: GoogleClient
  ) {}

  public async create(actor: User, input: CreateEventInput): Promise<FamilyEvent> {
    const calendar = this.requireWritableCalendar(input.calendarId);
    this.assertMembersExist(input.memberIds, input.tagMemberId);
    this.assertPanelMayWrite(actor, input.privacy);

    let uid = newEventUid();
    const times = { startAt: input.startAt, endAt: input.endAt, allDay: input.allDay };
    const timeZone = this.settings.get().timezone;
    try {
      if (calendar.provider === "google") {
        // Google assigns the event id, which then plays the role of the uid.
        uid = await this.google.createEvent(this.googleSecret(calendar.accountId), calendar.remoteUrl, {
          title: input.title,
          times,
          rrule: input.recurrence ? rruleText(input.recurrence, times.allDay, timeZone) : null,
          timeZone
        });
      } else {
        const recurrence = input.recurrence ? { rule: input.recurrence, timeZone } : undefined;
        const ics = buildEventIcs(uid, input.title, times, recurrence);
        await this.caldav.putEvent(this.credentials(calendar.accountId), eventResourceUrl(calendar.remoteUrl, uid), ics, { create: true });
      }
    } catch (error) {
      if (error instanceof CalDavError && error.kind === "conflict") {
        throw AppException.conflict("Sul calendario esiste già un evento con lo stesso identificativo. Riprova.");
      }
      throw providerError(error);
    }
    this.calendars.invalidate(calendar.id);

    const meta = this.events.upsertRemoteMeta(calendar.id, uid, actor.id, {
      privacy: input.privacy,
      tagMemberId: input.tagMemberId,
      memberIds: input.memberIds
    });

    return {
      id: encodeRemoteEventId({ calendarId: calendar.id, uid, occurrenceKey: "" }),
      calendarId: calendar.id,
      title: input.title,
      ...times,
      memberIds: meta.memberIds,
      tagMemberId: meta.tag_member_id,
      privacy: meta.privacy,
      source: "remote",
      membersInferred: false,
      recurring: Boolean(input.recurrence),
      redacted: false
    };
  }

  public async update(actor: User, eventId: string, input: UpdateEventInput): Promise<{ id: string }> {
    this.assertMembersExist(input.memberIds ?? [], input.tagMemberId ?? null);
    this.assertPanelMayWrite(actor, input.privacy, eventId);

    const remote = decodeRemoteEventId(eventId);
    if (!remote) {
      return { id: this.updateLocal(eventId, input) };
    }

    const calendar = this.requireWritableCalendar(remote.calendarId);
    const scope = this.requireScope(remote, input.scope);
    const { title, startAt, endAt, allDay } = input;

    if ([title, startAt, endAt, allDay].some((value) => value !== undefined)) {
      if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
        throw AppException.validation("La fine deve essere dopo l'inizio.");
      }

      try {
        if (calendar.provider === "google") {
          await this.google.updateEvent(
            this.googleSecret(calendar.accountId),
            calendar.remoteUrl,
            remote,
            scope,
            { title, startAt, endAt, allDay },
            this.settings.get().timezone
          );
        } else {
          const credentials = this.credentials(calendar.accountId);
          const resource = await this.caldav.findByUid(credentials, calendar.remoteUrl, remote.uid);
          if (!resource) {
            throw AppException.notFound("L'evento non esiste più sul calendario.");
          }
          const ics = applyEventEdit(resource.ics, remote.uid, remote.occurrenceKey, scope, { title, startAt, endAt, allDay });
          await this.caldav.putEvent(credentials, resource.href, ics, { etag: resource.etag });
        }
      } catch (error) {
        throw providerError(error);
      }
    }

    if (input.memberIds !== undefined || input.tagMemberId !== undefined || input.privacy !== undefined) {
      this.events.upsertRemoteMeta(calendar.id, remoteMetaKey(remote.uid, remote.occurrenceKey, scope), actor.id, {
        privacy: input.privacy,
        tagMemberId: input.tagMemberId,
        memberIds: input.memberIds
      });
    }

    this.calendars.invalidate(calendar.id);
    return { id: eventId };
  }

  public async delete(actor: User, eventId: string, requestedScope?: RecurrenceScope): Promise<void> {
    this.assertPanelMayWrite(actor, undefined, eventId);
    const remote = decodeRemoteEventId(eventId);
    if (!remote) {
      const current = this.events.findById(eventId);
      if (!current || current.source !== "local") {
        throw AppException.notFound("Evento non trovato.");
      }
      this.events.delete(eventId);
      return;
    }

    const calendar = this.requireWritableCalendar(remote.calendarId);
    const scope = this.requireScope(remote, requestedScope);

    try {
      const credentials = this.credentials(calendar.accountId);
      const resource =
        calendar.provider === "google"
          ? (await this.google.deleteEvent(this.googleSecret(calendar.accountId), calendar.remoteUrl, remote, scope), null)
          : await this.caldav.findByUid(credentials, calendar.remoteUrl, remote.uid);
      if (resource) {
        const ics = applyEventDelete(resource.ics, remote.uid, remote.occurrenceKey, scope);
        if (ics === null) {
          await this.caldav.deleteEvent(credentials, resource.href, resource.etag);
        } else {
          await this.caldav.putEvent(credentials, resource.href, ics, { etag: resource.etag });
        }
      }
    } catch (error) {
      throw providerError(error);
    }
    this.calendars.invalidate(calendar.id);

    const wholeSeries = scope === "series" || !remote.occurrenceKey;
    this.events.deleteRemoteMeta(calendar.id, remoteMetaKey(remote.uid, remote.occurrenceKey, scope), wholeSeries);
  }

  /** Recurring occurrences must say what they apply to; the UI always asks the user. */
  private requireScope(remote: RemoteEventRef, scope: RecurrenceScope | undefined): RecurrenceScope {
    if (!remote.occurrenceKey) {
      return "series";
    }
    if (!scope) {
      throw AppException.validation("Evento ricorrente: indica se la modifica vale per questa occorrenza o per tutta la serie.");
    }
    return scope;
  }

  /** Events created before provider write-back existed live only in the database. */
  private updateLocal(eventId: string, input: UpdateEventInput): string {
    const current = this.events.findById(eventId);
    if (!current || current.source !== "local") {
      throw AppException.notFound("Evento non trovato.");
    }

    const startAt = input.startAt ?? current.start_at!;
    const endAt = input.endAt ?? current.end_at!;
    if (new Date(endAt) <= new Date(startAt)) {
      throw AppException.validation("La fine deve essere dopo l'inizio.");
    }

    const { scope: _scope, ...fields } = input;
    return this.events.update(eventId, fields).id;
  }

  private googleSecret(accountId: string): GoogleSecret {
    return parseGoogleSecret(this.credentials(accountId).password);
  }

  private credentials(accountId: string): CalDavCredentials {
    try {
      const credentials = this.accounts.credentials(accountId);
      if (!credentials) {
        throw AppException.notFound("Account del calendario mancante.");
      }
      return credentials;
    } catch (error) {
      throw providerError(error);
    }
  }

  private requireWritableCalendar(calendarId: string) {
    const calendar = this.calendars.requireCalendar(calendarId);
    if (READ_ONLY_PROVIDERS.includes(calendar.provider)) {
      throw AppException.forbidden("Questo calendario è in sola lettura.");
    }
    if (!calendar.enabled) {
      throw AppException.conflict("Il calendario è disattivato.");
    }
    return calendar;
  }

  /**
   * Wall panels in write mode only handle shared events: they cannot see the details
   * of private or wall-hidden ones, so they must not change them or create new ones.
   */
  private assertPanelMayWrite(actor: User, privacy: string | undefined, eventId?: string): void {
    if (actor.role !== "Kiosk") {
      return;
    }
    if (privacy !== undefined && privacy !== "shared") {
      throw AppException.forbidden("Dal pannello si gestiscono solo eventi condivisi.");
    }
    if (eventId !== undefined && this.currentPrivacy(eventId) !== "shared") {
      throw AppException.forbidden("Questo evento si modifica solo dall'app dei genitori.");
    }
  }

  private currentPrivacy(eventId: string): string {
    const remote = decodeRemoteEventId(eventId);
    if (!remote) {
      return this.events.findById(eventId)?.privacy ?? "shared";
    }
    const meta =
      (remote.occurrenceKey ? this.events.findRemoteMeta(remote.calendarId, remoteMetaKey(remote.uid, remote.occurrenceKey, "occurrence")) : undefined) ??
      this.events.findRemoteMeta(remote.calendarId, remote.uid);
    return meta?.privacy ?? "shared";
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
