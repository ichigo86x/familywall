import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { EventPrivacy, EventSource } from "@familywall/shared";
import { DATABASE, nowIso, transaction, type Database } from "../../database/database";

export interface EventRow {
  id: string;
  calendar_id: string;
  uid: string;
  source: EventSource;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day: number;
  privacy: EventPrivacy;
  tag_member_id: string | null;
  created_by: string | null;
}

export interface StoredEvent extends EventRow {
  memberIds: string[];
}

export interface EventFields {
  title?: string;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  privacy?: EventPrivacy;
  tagMemberId?: string | null;
  memberIds?: string[];
}

@Injectable()
export class EventsRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Local events overlapping the range plus every remote-metadata row of the calendars. */
  public listForCalendars(calendarIds: string[], from: string, to: string): StoredEvent[] {
    if (calendarIds.length === 0) {
      return [];
    }

    const placeholders = calendarIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT * FROM events
         WHERE calendar_id IN (${placeholders})
           AND (source = 'remote' OR (start_at < ? AND end_at > ?))`
      )
      .all(...calendarIds, to, from) as unknown as EventRow[];
    return this.withMembers(rows);
  }

  public findById(id: string): StoredEvent | undefined {
    const row = this.db.prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
    return row ? this.withMembers([row])[0] : undefined;
  }

  public findRemoteMeta(calendarId: string, uid: string): StoredEvent | undefined {
    const row = this.db
      .prepare("SELECT * FROM events WHERE calendar_id = ? AND uid = ? AND source = 'remote'")
      .get(calendarId, uid) as EventRow | undefined;
    return row ? this.withMembers([row])[0] : undefined;
  }

  public insertLocal(calendarId: string, createdBy: string, fields: Required<EventFields>): StoredEvent {
    const id = randomUUID();
    const now = nowIso();
    transaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO events (id, calendar_id, uid, source, title, start_at, end_at, all_day, privacy, tag_member_id, created_by, created_at, updated_at)
           VALUES (?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, calendarId, `${id}@familywall`, fields.title, fields.startAt, fields.endAt, Number(fields.allDay), fields.privacy, fields.tagMemberId, createdBy, now, now);
      this.replaceMembers(id, fields.memberIds);
    });
    return this.findById(id)!;
  }

  /** Remote events only store app metadata; the provider stays the source of truth for the rest. */
  public upsertRemoteMeta(calendarId: string, uid: string, createdBy: string, fields: Pick<EventFields, "privacy" | "tagMemberId" | "memberIds">): StoredEvent {
    const existing = this.findRemoteMeta(calendarId, uid);
    if (!existing) {
      const id = randomUUID();
      const now = nowIso();
      transaction(this.db, () => {
        this.db
          .prepare(
            `INSERT INTO events (id, calendar_id, uid, source, privacy, tag_member_id, created_by, created_at, updated_at)
             VALUES (?, ?, ?, 'remote', ?, ?, ?, ?, ?)`
          )
          .run(id, calendarId, uid, fields.privacy ?? "shared", fields.tagMemberId ?? null, createdBy, now, now);
        this.replaceMembers(id, fields.memberIds ?? []);
      });
      return this.findById(id)!;
    }

    return this.update(existing.id, fields);
  }

  public update(id: string, fields: EventFields): StoredEvent {
    const current = this.findById(id)!;
    transaction(this.db, () => {
      this.db
        .prepare(
          `UPDATE events SET title = ?, start_at = ?, end_at = ?, all_day = ?, privacy = ?, tag_member_id = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          fields.title ?? current.title,
          fields.startAt ?? current.start_at,
          fields.endAt ?? current.end_at,
          fields.allDay === undefined ? current.all_day : Number(fields.allDay),
          fields.privacy ?? current.privacy,
          fields.tagMemberId === undefined ? current.tag_member_id : fields.tagMemberId,
          nowIso(),
          id
        );
      if (fields.memberIds) {
        this.replaceMembers(id, fields.memberIds);
      }
    });
    return this.findById(id)!;
  }

  /** Drops app metadata of a provider event: one occurrence, or the series with all its occurrence rows. */
  public deleteRemoteMeta(calendarId: string, key: string, wholeSeries: boolean): void {
    if (wholeSeries) {
      this.db
        .prepare("DELETE FROM events WHERE calendar_id = ? AND source = 'remote' AND (uid = ? OR substr(uid, 1, ?) = ?)")
        .run(calendarId, key, key.length + 2, `${key}::`);
    } else {
      this.db.prepare("DELETE FROM events WHERE calendar_id = ? AND source = 'remote' AND uid = ?").run(calendarId, key);
    }
  }

  public delete(id: string): void {
    this.db.prepare("DELETE FROM events WHERE id = ?").run(id);
  }

  private replaceMembers(eventId: string, memberIds: string[]): void {
    this.db.prepare("DELETE FROM event_members WHERE event_id = ?").run(eventId);
    const insert = this.db.prepare("INSERT INTO event_members (event_id, member_id) VALUES (?, ?)");
    for (const memberId of new Set(memberIds)) {
      insert.run(eventId, memberId);
    }
  }

  private withMembers(rows: EventRow[]): StoredEvent[] {
    if (rows.length === 0) {
      return [];
    }

    const membersByEvent = new Map<string, string[]>();
    const select = this.db.prepare("SELECT member_id FROM event_members WHERE event_id = ?");
    for (const row of rows) {
      membersByEvent.set(row.id, (select.all(row.id) as Array<{ member_id: string }>).map((entry) => entry.member_id));
    }

    return rows.map((row) => ({ ...row, memberIds: membersByEvent.get(row.id) ?? [] }));
  }
}
