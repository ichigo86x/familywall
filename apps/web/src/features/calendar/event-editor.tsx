import { useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody
} from "@fluentui/react-components";
import type { EventPrivacy, FamilyEvent, RecurrenceScope, UpdateEventInput, User } from "@familywall/shared";

import { api } from "@/api/client";
import { DeleteRegular } from "@/lib/fluent-icons";
import { addDays, eventBounds, fromInputs, timeLabel, toInputValue } from "./calendar-time";

export interface CalendarOption {
  id: string;
  name: string;
}

interface EventEditorProps {
  /** null when creating a new event. */
  event: (FamilyEvent & { calendarName: string }) | null;
  calendars: CalendarOption[];
  members: User[];
  membersById: Map<string, User>;
  readOnly: boolean;
  onSaved: (eventId: string | null) => void;
}

interface Draft {
  calendarId: string;
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  memberIds: string[];
  tagMemberId: string | null;
  privacy: EventPrivacy;
}

const PRIVACY_LABELS: Record<EventPrivacy, string> = {
  shared: "Condiviso",
  private: "Privato (dettagli solo a genitori e partecipanti)",
  "wall-hidden": "Nascosto sul pannello a muro"
};

const draftFromEvent = (event: FamilyEvent): Draft => {
  const { start, end } = eventBounds(event);
  return {
    calendarId: event.calendarId,
    title: event.title,
    allDay: event.allDay,
    start: toInputValue(start, event.allDay),
    // All-day ends are exclusive in the API; the date input shows the last day.
    end: toInputValue(event.allDay ? addDays(end, -1) : end, event.allDay),
    memberIds: event.memberIds,
    tagMemberId: event.tagMemberId,
    privacy: event.privacy
  };
};

const newDraft = (calendarId: string): Draft => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { calendarId, title: "", allDay: false, start: toInputValue(start, false), end: toInputValue(end, false), memberIds: [], tagMemberId: null, privacy: "shared" };
};

export const EventEditor = ({ event, calendars, members, membersById, readOnly, onSaved }: EventEditorProps) => {
  const [draft, setDraft] = useState<Draft>(() => (event ? draftFromEvent(event) : newDraft(calendars[0]?.id ?? "")));
  const [feedback, setFeedback] = useState<{ intent: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingScope, setPendingScope] = useState<"save" | "delete" | null>(null);

  if (event && (readOnly || event.redacted)) {
    return (
      <div className="calendar-detail-form">
        <p className="calendar-detail-hint">{event.calendarName}</p>
        <p>
          <strong>{event.allDay ? "Tutto il giorno" : timeLabel(event)}</strong> ·{" "}
          {eventBounds(event).start.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        {event.redacted ? <p className="calendar-detail-hint">Evento privato: sono visibili solo gli orari.</p> : null}
        {event.memberIds.length > 0 ? (
          <div className="member-chip-grid">
            {event.memberIds.map((id) => membersById.get(id)).filter((member): member is User => Boolean(member)).map((member) => (
              <span key={member.id} className="member-chip" style={{ borderColor: member.color, background: `${member.color}22` }}>
                <span className="member-chip__swatch" style={{ background: member.color }} />
                {member.displayName}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const toggleAllDay = (allDay: boolean) => {
    setDraft((current) => {
      const start = new Date(current.allDay ? `${current.start}T09:00` : current.start);
      const end = new Date(current.allDay ? `${current.end}T10:00` : current.end);
      return { ...current, allDay, start: toInputValue(start, allDay), end: toInputValue(end, allDay) };
    });
  };

  const toggleMember = (memberId: string) => {
    setDraft((current) => {
      const memberIds = current.memberIds.includes(memberId) ? current.memberIds.filter((id) => id !== memberId) : [...current.memberIds, memberId];
      return { ...current, memberIds, tagMemberId: current.tagMemberId && memberIds.includes(current.tagMemberId) ? current.tagMemberId : null };
    });
  };

  /** Recurring occurrences ask "only this one or the whole series?" before writing. */
  const withScope = (action: "save" | "delete") => {
    if (event?.recurring) {
      setPendingScope(action);
      return;
    }
    void (action === "save" ? save() : remove());
  };

  const save = async (scope?: RecurrenceScope) => {
    if (!draft.title.trim()) {
      setFeedback({ intent: "error", text: "Il titolo è obbligatorio." });
      return;
    }

    const times = fromInputs(draft.start, draft.end, draft.allDay);
    if (new Date(times.endAt) <= new Date(times.startAt)) {
      setFeedback({ intent: "error", text: "La fine deve essere dopo l'inizio." });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const metadata = { memberIds: draft.memberIds, tagMemberId: draft.tagMemberId, privacy: draft.privacy };
      if (!event) {
        const created = await api.createEvent({ calendarId: draft.calendarId, title: draft.title.trim(), allDay: draft.allDay, ...times, ...metadata });
        onSaved(created.id);
        return;
      }

      // Only changed provider fields are sent, so a metadata-only edit does not rewrite the provider event.
      const initial = draftFromEvent(event);
      const timesChanged = draft.start !== initial.start || draft.end !== initial.end || draft.allDay !== initial.allDay;
      const input: UpdateEventInput = {
        ...metadata,
        ...(draft.title.trim() !== initial.title ? { title: draft.title.trim() } : {}),
        ...(timesChanged ? { allDay: draft.allDay, ...times } : {}),
        ...(scope ? { scope } : {})
      };
      await api.updateEvent(event.id, input);
      setFeedback({ intent: "success", text: "Evento salvato." });
      onSaved(event.id);
    } catch (error) {
      setFeedback({ intent: "error", text: error instanceof Error ? error.message : "Impossibile salvare l'evento." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (scope?: RecurrenceScope) => {
    if (!event || (!scope && !window.confirm(`Eliminare "${event.title}"?`))) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteEvent(event.id, scope);
      onSaved(null);
    } catch (error) {
      setFeedback({ intent: "error", text: error instanceof Error ? error.message : "Impossibile eliminare l'evento." });
      setBusy(false);
    }
  };

  return (
    <div className="calendar-detail-form">
      {event?.recurring ? (
        <MessageBar intent="info">
          <MessageBarBody>Evento ripetuto: al salvataggio potrai scegliere se modificare solo questo evento o tutta la serie.</MessageBarBody>
        </MessageBar>
      ) : null}

      <div className="calendar-detail-row">
        <label htmlFor="event-title">Titolo</label>
        <input id="event-title" value={draft.title} onChange={(change) => update("title", change.target.value)} placeholder="Karate Luca, vaccino Sofia..." />
      </div>

      <div className="calendar-detail-row">
        <label htmlFor="event-calendar">Calendario</label>
        <select id="event-calendar" value={draft.calendarId} disabled={Boolean(event)} onChange={(change) => update("calendarId", change.target.value)}>
          {calendars.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name}</option>
          ))}
        </select>
      </div>

      <Checkbox label="Tutto il giorno" checked={draft.allDay} onChange={(_, data) => toggleAllDay(Boolean(data.checked))} />

      <div className="calendar-detail-grid">
        <div className="calendar-detail-row">
          <label htmlFor="event-start">Inizio</label>
          <input id="event-start" type={draft.allDay ? "date" : "datetime-local"} value={draft.start} onChange={(change) => update("start", change.target.value)} />
        </div>
        <div className="calendar-detail-row">
          <label htmlFor="event-end">Fine</label>
          <input id="event-end" type={draft.allDay ? "date" : "datetime-local"} value={draft.end} onChange={(change) => update("end", change.target.value)} />
        </div>
      </div>

      <div className="calendar-detail-row">
        <label>Membri coinvolti</label>
        {event?.membersInferred && draft.memberIds.join() === event.memberIds.join() ? (
          <p className="calendar-detail-hint">Riconosciuti dai nomi nel titolo. Salva per confermarli o cambiali qui.</p>
        ) : null}
        <div className="member-chip-grid">
          {members.map((member) => {
            const selected = draft.memberIds.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                className={`member-chip ${selected ? "member-chip--selected" : ""}`.trim()}
                style={{ borderColor: member.color, background: selected ? `${member.color}22` : "#fff" }}
                onClick={() => toggleMember(member.id)}
                aria-pressed={selected}
              >
                <span className="member-chip__swatch" style={{ background: member.color }} />
                <span>{member.displayName}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="calendar-detail-row">
        <label htmlFor="event-tag">Colore principale</label>
        <select id="event-tag" value={draft.tagMemberId ?? ""} onChange={(change) => update("tagMemberId", change.target.value || null)}>
          <option value="">Automatico (colori dei membri)</option>
          {members.filter((member) => draft.memberIds.includes(member.id)).map((member) => (
            <option key={member.id} value={member.id}>{member.displayName}</option>
          ))}
        </select>
      </div>

      <div className="calendar-detail-row">
        <label htmlFor="event-privacy">Privacy</label>
        <select id="event-privacy" value={draft.privacy} onChange={(change) => update("privacy", change.target.value as EventPrivacy)}>
          {(Object.keys(PRIVACY_LABELS) as EventPrivacy[]).map((privacy) => (
            <option key={privacy} value={privacy}>{PRIVACY_LABELS[privacy]}</option>
          ))}
        </select>
      </div>

      {feedback ? (
        <MessageBar intent={feedback.intent}>
          <MessageBarBody>{feedback.text}</MessageBarBody>
        </MessageBar>
      ) : null}

      <div className="calendar-detail-actions">
        {event ? (
          <Button appearance="secondary" icon={<DeleteRegular />} disabled={busy} onClick={() => withScope("delete")}>
            Elimina
          </Button>
        ) : null}
        <Button appearance="primary" disabled={busy} onClick={() => withScope("save")}>
          {busy ? "Salvataggio..." : event ? "Salva modifiche" : "Crea evento"}
        </Button>
      </div>

      <Dialog open={pendingScope !== null} onOpenChange={(_, data) => (!data.open ? setPendingScope(null) : undefined)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{pendingScope === "delete" ? "Eliminare l'evento ripetuto?" : "Modificare l'evento ripetuto?"}</DialogTitle>
            <DialogContent>
              "{event?.title}" fa parte di una serie. Scegli se {pendingScope === "delete" ? "eliminare" : "modificare"} solo questo evento o tutti gli eventi della serie.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setPendingScope(null)}>Annulla</Button>
              <Button
                appearance="secondary"
                onClick={() => {
                  const action = pendingScope;
                  setPendingScope(null);
                  void (action === "delete" ? remove("series") : save("series"));
                }}
              >
                Tutta la serie
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  const action = pendingScope;
                  setPendingScope(null);
                  void (action === "delete" ? remove("occurrence") : save("occurrence"));
                }}
              >
                Solo questo evento
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};
