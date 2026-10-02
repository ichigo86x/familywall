import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { User, UserRole } from "@familywall/shared";
import { DATABASE, nowIso, type Database } from "../../database/database";

export interface MemberRow {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  color: string;
  password_hash: string;
  token_version: number;
  disabled: number;
  created_at: string;
  updated_at: string;
}

export interface NewMember {
  username: string;
  displayName: string;
  role: UserRole;
  color: string;
  passwordHash: string;
}

export interface MemberPatch {
  displayName?: string;
  role?: UserRole;
  color?: string;
  disabled?: boolean;
}

export const toUser = (row: MemberRow): User => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  role: row.role,
  color: row.color,
  disabled: row.disabled === 1
});

@Injectable()
export class MembersRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS total FROM members").get() as { total: number }).total;
  }

  public countActiveAdmins(): number {
    return (
      this.db.prepare("SELECT COUNT(*) AS total FROM members WHERE role = 'Admin' AND disabled = 0").get() as { total: number }
    ).total;
  }

  public findById(id: string): MemberRow | undefined {
    return this.db.prepare("SELECT * FROM members WHERE id = ?").get(id) as MemberRow | undefined;
  }

  public findByUsername(username: string): MemberRow | undefined {
    return this.db.prepare("SELECT * FROM members WHERE username = ?").get(username) as MemberRow | undefined;
  }

  public existingIds(ids: string[]): Set<string> {
    if (ids.length === 0) {
      return new Set();
    }

    const rows = this.db
      .prepare(`SELECT id FROM members WHERE id IN (${ids.map(() => "?").join(", ")})`)
      .all(...ids) as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
  }

  public list(): User[] {
    return (this.db.prepare("SELECT * FROM members ORDER BY created_at").all() as unknown as MemberRow[]).map(toUser);
  }

  public insert(member: NewMember): MemberRow {
    const now = nowIso();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO members (id, username, display_name, role, color, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, member.username, member.displayName, member.role, member.color, member.passwordHash, now, now);
    return this.findById(id)!;
  }

  /** Role or status changes revoke existing tokens so permissions apply immediately. */
  public update(id: string, patch: MemberPatch): MemberRow {
    const current = this.findById(id)!;
    const revokeTokens =
      (patch.role !== undefined && patch.role !== current.role) ||
      (patch.disabled !== undefined && patch.disabled !== (current.disabled === 1));

    this.db
      .prepare(
        `UPDATE members
         SET display_name = ?, role = ?, color = ?, disabled = ?, token_version = token_version + ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        patch.displayName ?? current.display_name,
        patch.role ?? current.role,
        patch.color ?? current.color,
        patch.disabled === undefined ? current.disabled : Number(patch.disabled),
        revokeTokens ? 1 : 0,
        nowIso(),
        id
      );
    return this.findById(id)!;
  }

  public setPassword(id: string, passwordHash: string): void {
    this.db
      .prepare("UPDATE members SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?")
      .run(passwordHash, nowIso(), id);
  }

  public delete(id: string): void {
    this.db.prepare("DELETE FROM members WHERE id = ?").run(id);
  }
}
