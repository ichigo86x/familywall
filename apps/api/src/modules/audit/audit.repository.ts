import { Inject, Injectable } from "@nestjs/common";
import type { AuditEntry, AuditLogResponse } from "@familywall/shared";
import { DATABASE, nowIso, type Database } from "../../database/database";

interface AuditRow {
  id: number;
  at: string;
  member_id: string | null;
  username: string | null;
  action: string;
  request: string;
  status: number;
  ip: string | null;
}

/** Entries are kept for this long, and never more than MAX_ROWS. */
const KEEP_DAYS = 180;
const MAX_ROWS = 20_000;

const toEntry = (row: AuditRow): AuditEntry => ({
  id: row.id,
  at: row.at,
  memberId: row.member_id,
  username: row.username,
  action: row.action,
  request: row.request,
  status: row.status,
  ip: row.ip
});

@Injectable()
export class AuditRepository {
  private writes = 0;

  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public record(entry: Omit<AuditEntry, "id" | "at">): void {
    this.db
      .prepare("INSERT INTO audit_log (at, member_id, username, action, request, status, ip) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(nowIso(), entry.memberId, entry.username, entry.action, entry.request, entry.status, entry.ip);
    // Old entries are dropped now and then, not at every write.
    this.writes += 1;
    if (this.writes % 200 === 1) {
      this.prune();
    }
  }

  public list(before: number | null, limit: number): AuditLogResponse {
    const rows = (
      before === null
        ? this.db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit + 1)
        : this.db.prepare("SELECT * FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT ?").all(before, limit + 1)
    ) as unknown as AuditRow[];
    const entries = rows.slice(0, limit).map(toEntry);
    return { entries, nextBefore: rows.length > limit ? entries[entries.length - 1]!.id : null };
  }

  public prune(now = new Date()): void {
    const oldest = new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare("DELETE FROM audit_log WHERE at < ?").run(oldest);
    this.db.prepare("DELETE FROM audit_log WHERE id <= (SELECT id FROM audit_log ORDER BY id DESC LIMIT 1 OFFSET ?)").run(MAX_ROWS);
  }
}
