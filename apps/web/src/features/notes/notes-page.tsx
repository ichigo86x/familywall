import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  Field,
  Input,
  Switch,
  Textarea
} from "@fluentui/react-components";
import type { FamilyNote, User } from "@familywall/shared";

import { api } from "@/api/client";
import { useNewParam } from "@/hooks/use-new-param";
import { OccasionsCard } from "./occasions-card";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/page-states";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { AddRegular, PinFilled } from "@/lib/fluent-icons";

/** Sticky-note colors, light enough for dark text. */
const NOTE_COLORS = ["#FFF4B8", "#FFD8B8", "#FFC9DE", "#D9F2C2", "#C9E7FF", "#E4D7FF", "#FFFFFF"];

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

export const NotesPage = () => {
  const auth = useAuth();
  const canWrite = auth.can("lists:write");
  const notes = useAsyncResource(() => api.getNotes(), []);
  const members = useAsyncResource(() => api.getMembers(), []);
  const [editing, setEditing] = useState<FamilyNote | "new" | null>(null);
  useNewParam(canWrite, () => setEditing("new"));
  const membersById = new Map((members.data ?? []).map((member) => [member.id, member]));

  return (
    <AppShell
      compact
      currentRoute="/notes"
      eyebrow="Note"
      title="Bacheca della famiglia"
      subtitle=""
      summaryChip={`${notes.data?.length ?? 0} note`}
      toolbarActions={
        canWrite ? (
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setEditing("new")}>
            Nuova nota
          </Button>
        ) : null
      }
    >
      {notes.status === "loading" && !notes.data ? (
        <LoadingState title="Caricamento note" message="Lettura della bacheca." />
      ) : notes.status === "error" ? (
        <ErrorState title="Note non disponibili" message={notes.error.message} actionLabel="Riprova" onAction={notes.reload} />
      ) : (notes.data?.length ?? 0) === 0 ? (
        <EmptyState title="Bacheca vuota" message="Aggiungi una nota: compiti, codici del wifi, numeri utili..." actionLabel="Ricarica" onAction={notes.reload} />
      ) : (
        <div className="notes-grid">
          {notes.data!.map((note) => (
            <NoteCard key={note.id} note={note} author={note.createdBy ? membersById.get(note.createdBy) : undefined} onOpen={canWrite ? () => setEditing(note) : undefined} />
          ))}
        </div>
      )}

      <OccasionsCard canWrite={auth.can("events:write")} />

      {editing ? (
        <NoteDialog
          note={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notes.reload();
          }}
        />
      ) : null}
    </AppShell>
  );
};

const NoteCard = ({ note, author, onOpen }: { note: FamilyNote; author: User | undefined; onOpen?: () => void }) => {
  const content = (
    <>
      {note.pinned ? <PinFilled className="note-card__pin" aria-label="Fissata" /> : null}
      {note.title ? <h3>{note.title}</h3> : null}
      {note.onDashboard ? <span className="note-card__badge">In dashboard</span> : null}
      {note.body ? <p>{note.body}</p> : null}
      <footer>
        {author ? <span className="legend-chip__swatch" style={{ background: author.color }} /> : null}
        {author?.displayName ?? ""} · {new Date(note.updatedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
      </footer>
    </>
  );
  return onOpen ? (
    <button type="button" className="note-card" style={{ background: note.color }} onClick={onOpen}>
      {content}
    </button>
  ) : (
    <article className="note-card" style={{ background: note.color }}>
      {content}
    </article>
  );
};

const NoteDialog = ({ note, onClose, onSaved }: { note: FamilyNote | null; onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState({
    title: note?.title ?? "",
    body: note?.body ?? "",
    color: note?.color ?? NOTE_COLORS[0]!,
    pinned: note?.pinned ?? false,
    onDashboard: note?.onDashboard ?? false
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      onSaved();
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>{note ? "Modifica nota" : "Nuova nota"}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <Field label="Titolo">
              <Input value={form.title} onChange={(_, data) => setForm({ ...form, title: data.value })} />
            </Field>
            <Field label="Testo">
              <Textarea resize="vertical" rows={6} value={form.body} onChange={(_, data) => setForm({ ...form, body: data.value })} />
            </Field>
            <Field label="Colore">
              <div className="color-picker">
                {NOTE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${form.color === color ? "color-swatch--selected" : ""}`.trim()}
                    style={{ background: color, borderColor: "#d1d5db" }}
                    aria-label={color}
                    onClick={() => setForm({ ...form, color })}
                  />
                ))}
              </div>
            </Field>
            <Switch label="Fissata in alto" checked={form.pinned} onChange={(_, data) => setForm({ ...form, pinned: data.checked })} />
            <Switch label="Mostra in dashboard" checked={form.onDashboard} onChange={(_, data) => setForm({ ...form, onDashboard: data.checked })} />
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            {note ? (
              <Button
                appearance="secondary"
                disabled={busy}
                onClick={() => (window.confirm("Eliminare la nota?") ? void run(() => api.deleteNote(note.id)) : undefined)}
              >
                Elimina
              </Button>
            ) : null}
            <Button appearance="secondary" onClick={onClose}>Annulla</Button>
            <Button
              appearance="primary"
              disabled={busy || (!form.title.trim() && !form.body.trim())}
              onClick={() => void run(() => (note ? api.updateNote(note.id, form) : api.createNote(form)))}
            >
              Salva
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
