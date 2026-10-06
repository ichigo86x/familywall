import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { FamilyNote, UpdateNoteInput } from "@familywall/shared";
import { DATABASE, nowIso, type Database } from "../../database/database";

interface NoteRow {
  id: string;
  title: string;
  body: string;
  color: string;
  pinned: number;
  on_dashboard: number;
  created_by: string | null;
  updated_at: string;
}

const toNote = (row: NoteRow): FamilyNote => ({
  id: row.id,
  title: row.title,
  body: row.body,
  color: row.color,
  pinned: row.pinned === 1,
  onDashboard: row.on_dashboard === 1,
  createdBy: row.created_by,
  updatedAt: row.updated_at
});

export interface NewNote {
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  onDashboard: boolean;
}

/** The family notes board lives only in Familywall (no provider). */
@Injectable()
export class NotesRepository {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public list(): FamilyNote[] {
    return (this.db.prepare("SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC").all() as unknown as NoteRow[]).map(toNote);
  }

  public findById(id: string): FamilyNote | undefined {
    const row = this.db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | undefined;
    return row ? toNote(row) : undefined;
  }

  public insert(note: NewNote, createdBy: string): FamilyNote {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare("INSERT INTO notes (id, title, body, color, pinned, on_dashboard, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, note.title, note.body, note.color, Number(note.pinned), Number(note.onDashboard), createdBy, now, now);
    return this.findById(id)!;
  }

  public update(id: string, patch: UpdateNoteInput): FamilyNote {
    const current = this.findById(id)!;
    this.db
      .prepare("UPDATE notes SET title = ?, body = ?, color = ?, pinned = ?, on_dashboard = ?, updated_at = ? WHERE id = ?")
      .run(
        patch.title ?? current.title,
        patch.body ?? current.body,
        patch.color ?? current.color,
        Number(patch.pinned ?? current.pinned),
        Number(patch.onDashboard ?? current.onDashboard),
        nowIso(),
        id
      );
    return this.findById(id)!;
  }

  public delete(id: string): void {
    this.db.prepare("DELETE FROM notes WHERE id = ?").run(id);
  }
}
