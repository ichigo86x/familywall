import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AddTaskListInput, TaskListConfig, UpdateTaskListInput } from "@familywall/shared";
import { DATABASE, nowIso, type Database } from "../../database/database";

interface TaskListRow {
  id: string;
  account_id: string;
  account_label: string;
  remote_id: string;
  name: string;
  color: string;
  enabled: number;
}

const SELECT = `
  SELECT l.*, a.label AS account_label
  FROM task_lists l JOIN provider_accounts a ON a.id = l.account_id`;

const toConfig = (row: TaskListRow): TaskListConfig => ({
  id: row.id,
  accountId: row.account_id,
  accountLabel: row.account_label,
  remoteId: row.remote_id,
  name: row.name,
  color: row.color,
  enabled: row.enabled === 1
});

@Injectable()
export class TaskListsRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public list(options: { enabledOnly?: boolean } = {}): TaskListConfig[] {
    const where = options.enabledOnly ? "WHERE l.enabled = 1" : "";
    return (this.db.prepare(`${SELECT} ${where} ORDER BY l.sort_order, l.created_at`).all() as unknown as TaskListRow[]).map(toConfig);
  }

  public findById(id: string): TaskListConfig | undefined {
    const row = this.db.prepare(`${SELECT} WHERE l.id = ?`).get(id) as TaskListRow | undefined;
    return row ? toConfig(row) : undefined;
  }

  public remoteIdsForAccount(accountId: string): Set<string> {
    const rows = this.db.prepare("SELECT remote_id FROM task_lists WHERE account_id = ?").all(accountId) as Array<{ remote_id: string }>;
    return new Set(rows.map((row) => row.remote_id));
  }

  public insert(input: AddTaskListInput): TaskListConfig {
    const id = randomUUID();
    const { next } = this.db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM task_lists").get() as { next: number };
    this.db
      .prepare("INSERT INTO task_lists (id, account_id, remote_id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.accountId, input.remoteId, input.name, input.color, next, nowIso());
    return this.findById(id)!;
  }

  public update(id: string, patch: UpdateTaskListInput): TaskListConfig {
    const current = this.findById(id)!;
    this.db
      .prepare("UPDATE task_lists SET name = ?, color = ?, enabled = ? WHERE id = ?")
      .run(patch.name ?? current.name, patch.color ?? current.color, Number(patch.enabled ?? current.enabled), id);
    return this.findById(id)!;
  }

  public recordError(id: string, error: string | null): void {
    this.db.prepare("UPDATE task_lists SET last_error = ? WHERE id = ?").run(error, id);
  }

  public delete(id: string): void {
    this.db.prepare("DELETE FROM task_lists WHERE id = ?").run(id);
  }
}
