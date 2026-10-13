import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AddCalendarInput, CalendarConfig, UpdateCalendarInput } from "@familywall/shared";
import { DATABASE, nowIso, type Database } from "../../database/database";

interface CalendarRow {
  id: string;
  account_id: string;
  account_label: string;
  provider: CalendarConfig["provider"];
  remote_url: string;
  name: string;
  color: string;
  enabled: number;
  purpose: CalendarConfig["purpose"];
  last_synced_at: string | null;
  last_error: string | null;
  member_id: string | null;
}

const SELECT = `
  SELECT c.*, a.label AS account_label, a.provider AS provider
  FROM calendars c JOIN provider_accounts a ON a.id = c.account_id`;

const toConfig = (row: CalendarRow): CalendarConfig => ({
  id: row.id,
  accountId: row.account_id,
  accountLabel: row.account_label,
  provider: row.provider,
  remoteUrl: row.remote_url,
  name: row.name,
  color: row.color,
  enabled: row.enabled === 1,
  purpose: row.purpose,
  memberId: row.member_id ?? null,
  lastSyncedAt: row.last_synced_at,
  lastError: row.last_error
});

@Injectable()
export class CalendarsRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public list(options: { enabledOnly?: boolean } = {}): CalendarConfig[] {
    const where = options.enabledOnly ? "WHERE c.enabled = 1" : "";
    return (this.db.prepare(`${SELECT} ${where} ORDER BY c.sort_order, c.created_at`).all() as unknown as CalendarRow[]).map(toConfig);
  }

  public findById(id: string): CalendarConfig | undefined {
    const row = this.db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as CalendarRow | undefined;
    return row ? toConfig(row) : undefined;
  }

  public remoteUrlsForAccount(accountId: string): Set<string> {
    const rows = this.db.prepare("SELECT remote_url FROM calendars WHERE account_id = ?").all(accountId) as Array<{ remote_url: string }>;
    return new Set(rows.map((row) => row.remote_url));
  }

  public insert(input: AddCalendarInput): CalendarConfig {
    const id = randomUUID();
    const { next } = this.db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM calendars").get() as { next: number };
    this.db
      .prepare("INSERT INTO calendars (id, account_id, remote_url, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.accountId, input.remoteUrl, input.name, input.color, next, nowIso());
    return this.findById(id)!;
  }

  public update(id: string, patch: UpdateCalendarInput): CalendarConfig {
    const current = this.findById(id)!;
    this.db
      .prepare("UPDATE calendars SET name = ?, color = ?, enabled = ?, purpose = ?, member_id = ? WHERE id = ?")
      .run(
        patch.name ?? current.name,
        patch.color ?? current.color,
        Number(patch.enabled ?? current.enabled),
        patch.purpose ?? current.purpose,
        patch.memberId === undefined ? current.memberId : patch.memberId,
        id
      );
    return this.findById(id)!;
  }

  public recordSync(id: string, error: string | null): void {
    if (error) {
      this.db.prepare("UPDATE calendars SET last_error = ? WHERE id = ?").run(error, id);
    } else {
      this.db.prepare("UPDATE calendars SET last_error = NULL, last_synced_at = ? WHERE id = ?").run(nowIso(), id);
    }
  }

  public delete(id: string): void {
    this.db.prepare("DELETE FROM calendars WHERE id = ?").run(id);
  }
}
