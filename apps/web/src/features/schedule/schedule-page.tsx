import { useMemo, useState } from "react";
import {
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  Field
} from "@fluentui/react-components";
import { canTickChore, isoWeek, scheduleForDay, weekStars, type ScheduleEntry, type ScheduleEntryInput, type ScheduleKind, type User, type WeekParity } from "@familywall/shared";

import { api } from "@/api/client";
import { useNewParam } from "@/hooks/use-new-param";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { ErrorState, LoadingState } from "@/components/page-states";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { useDragMove } from "@/hooks/use-drag-move";
import { AddRegular } from "@/lib/fluent-icons";
import { dayKey, startOfDay, startOfWeek } from "@/features/calendar/calendar-time";
import { PeriodToolbar, usePeriod } from "@/features/calendar/period-view";
import {
  CHORE_SUGGESTIONS,
  KIND_LABELS,
  PRESENCE_SUGGESTIONS,
  WEEKDAY_LABELS,
  WORK_MODES,
  entryIcon,
  entryTime,
  entryWho
} from "./schedule-labels";
import { RoutinesCard } from "./routines";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

export const SchedulePage = () => {
  const auth = useAuth();
  const canWrite = auth.can("events:write");
  const schedule = useAsyncResource(() => api.getSchedule(), [], "schedule");
  const members = useAsyncResource(() => api.getMembers(), [], "members");
  const routines = useAsyncResource(() => api.getRoutines(), [], "routines-all");
  const period = usePeriod("familywall.schedule.view");
  const [editing, setEditing] = useState<ScheduleEntry | "new" | null>(null);
  useNewParam(canWrite, () => setEditing("new"));

  const membersById = useMemo(() => new Map((members.data ?? []).map((member) => [member.id, member])), [members.data]);
  const days = period.days;
  const todayKey = dayKey(new Date());
  // Stars of the week shown, or of this week when it is in the period.
  const starsWeek = period.isCurrent ? startOfWeek(new Date()) : period.start;
  const parityOf = (day: Date) => (isoWeek(day) % 2 === 0 ? "pari" : "dispari");
  const toggleDone = useChoreToggle(schedule.reload);
  // Shifts are dragged to another day: a dated one changes date, a weekly one its weekday (after a confirmation).
  const [moving, setMoving] = useState<{ entry: ScheduleEntry; input: ScheduleEntryInput; text: string } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const saveMove = (entry: ScheduleEntry, input: ScheduleEntryInput) => {
    setMoving(null);
    setMoveError(null);
    api
      .updateScheduleEntry(entry.id, input)
      .then(schedule.reload)
      .catch((error: unknown) => setMoveError(error instanceof Error ? error.message : "Spostamento non riuscito."));
  };
  const drag = useDragMove((payload, targetKey) => {
    const { id, from } = JSON.parse(payload) as { id: string; from: string };
    const entry = (schedule.data ?? []).find((candidate) => candidate.id === id);
    if (!entry || from === targetKey) {
      return;
    }
    const move = movedEntry(entry, from, targetKey);
    if (entry.date !== null) {
      saveMove(entry, move.input);
    } else if (move.text) {
      setMoving({ entry, ...move });
    }
  });
  const mayTick = (entry: ScheduleEntry, day: Date) => {
    const daysBack = Math.round((startOfDay(new Date()).getTime() - startOfDay(day).getTime()) / 86_400_000);
    return Boolean(auth.user && canTickChore(auth.user, entry)) && daysBack >= 0 && daysBack <= 6;
  };

  return (
    <AppShell
      compact
      currentRoute="/schedule"
      eyebrow={period.mode === "week" ? `Settimana ${isoWeek(period.start)} (${parityOf(period.start)})` : period.label}
      title="Turni della famiglia"
      subtitle=""
      toolbarActions={
        <div className="calendar-toolbar">
          <PeriodToolbar period={period} />
          {canWrite ? (
            <Button appearance="primary" icon={<AddRegular />} onClick={() => setEditing("new")}>
              Nuovo turno
            </Button>
          ) : null}
        </div>
      }
    >
      {schedule.status === "loading" && !schedule.data ? (
        <LoadingState title="Caricamento turni" message="Lettura dei turni della famiglia." />
      ) : schedule.status === "error" ? (
        <ErrorState title="Turni non disponibili" message={schedule.error.message} actionLabel="Riprova" onAction={schedule.reload} />
      ) : (
        <Card className="panel-card">
          {(schedule.data ?? []).length === 0 ? (
            <p className="calendar-detail-hint">
              Nessun turno. Aggiungi lo smart working dei genitori, chi apparecchia e sparecchia, o quando viene la donna delle pulizie.
            </p>
          ) : null}
          <StarsLine entries={schedule.data ?? []} day={starsWeek} membersById={membersById} />
          {moveError ? <p className="form-error">{moveError}</p> : null}
          <div className={`schedule-week schedule-week--${period.mode}`}>
            {days.map((day) => {
              const entries = scheduleForDay(schedule.data ?? [], day);
              const isToday = dayKey(day) === todayKey;
              return (
                <section
                  key={dayKey(day)}
                  className={`schedule-day ${isToday ? "schedule-day--today" : ""} ${period.outside(day) ? "schedule-day--outside" : ""} ${drag.isOver(dayKey(day)) ? "drop-target--over" : ""}`.trim()}
                  {...(canWrite ? drag.target(dayKey(day)) : {})}
                >
                  <header>
                    <strong>
                      {day.toLocaleDateString("it-IT", { weekday: period.mode === "week" ? "long" : "short" })}
                      {/* Every other week matters for the shifts: Mondays say which week it is. */}
                      {period.mode !== "week" && day.getDay() === 1 ? <span className="schedule-day__week"> · sett. {isoWeek(day)} {parityOf(day)}</span> : null}
                    </strong>
                    {isToday ? <span className="today-pill">Oggi</span> : <span>{day.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>}
                  </header>
                  {entries.length === 0 ? <p className="calendar-detail-hint">—</p> : null}
                  {entries.map((entry) => {
                    const payload = JSON.stringify({ id: entry.id, from: dayKey(day) });
                    return (
                      <div key={entry.id} className={drag.draggingId === payload ? "drag-source--dragging" : undefined} {...(canWrite ? drag.source(payload) : {})}>
                        <ScheduleChip
                          entry={entry}
                          membersById={membersById}
                          onOpen={canWrite ? () => setEditing(entry) : undefined}
                          done={entry.done.includes(dayKey(day))}
                          onToggleDone={mayTick(entry, day) ? () => void toggleDone(entry, dayKey(day)) : undefined}
                        />
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </Card>
      )}

      {routines.data ? (
        <RoutinesCard
          routines={routines.data}
          members={(members.data ?? []).filter((member) => member.role !== "Kiosk" && !member.disabled)}
          canWrite={canWrite}
          onChanged={routines.reload}
        />
      ) : null}

      {moving ? (
        <Dialog open onOpenChange={(_, data) => (!data.open ? setMoving(null) : undefined)}>
          <DialogSurface className="event-dialog">
            <DialogBody>
              <CloseableDialogTitle>Spostare {moving.entry.title}?</CloseableDialogTitle>
              <DialogContent>{moving.text}</DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setMoving(null)}>Annulla</Button>
                <Button appearance="primary" onClick={() => saveMove(moving.entry, moving.input)}>Sposta</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      ) : null}

      {editing ? (
        <ScheduleDialog
          entry={editing === "new" ? null : editing}
          members={(members.data ?? []).filter((member) => member.role !== "Kiosk" && !member.disabled)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            schedule.reload();
          }}
        />
      ) : null}
    </AppShell>
  );
};

const WEEKDAY_NAMES = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const weekdayOf = (key: string) => new Date(`${key}T12:00:00`).getDay() || 7;

/**
 * The shift moved from one day to another: a dated shift takes the new date; a weekly one swaps the
 * weekday it was dragged from for the new one, every week (and, if every other week, the new week's turn).
 */
export const movedEntry = (entry: ScheduleEntry, fromKey: string, toKey: string): { input: ScheduleEntryInput; text: string } => {
  const base: ScheduleEntryInput = {
    kind: entry.kind,
    title: entry.title,
    memberId: entry.memberId,
    person: entry.person,
    weekdays: entry.weekdays,
    weekParity: entry.weekParity,
    date: entry.date,
    startTime: entry.startTime,
    endTime: entry.endTime,
    note: entry.note
  };
  if (entry.date !== null) {
    return { input: { ...base, date: toKey }, text: "" };
  }
  const from = weekdayOf(fromKey);
  const to = weekdayOf(toKey);
  const target = new Date(`${toKey}T12:00:00`);
  const parity: WeekParity = entry.weekParity === "all" ? "all" : isoWeek(target) % 2 === 0 ? "even" : "odd";
  if (from === to && parity === entry.weekParity) {
    return { input: base, text: "" };
  }
  const weekdays = [...new Set([...entry.weekdays.filter((day) => day !== from), to])].sort((left, right) => left - right);
  const every = entry.weekParity === "all" ? "ogni settimana" : "a settimane alterne";
  return {
    input: { ...base, weekdays, weekParity: parity },
    text: `Il turno si ripete ${every}: passerà da ${WEEKDAY_NAMES[from]} a ${WEEKDAY_NAMES[to]} in tutte le settimane, non solo in questa.`
  };
};

/** Ticks a chore for a day, then reloads; errors are shown in an alert (the wall has no room for more). */
export const useChoreToggle = (reload: () => void) => {
  const [busy, setBusy] = useState(false);
  return async (entry: ScheduleEntry, date: string) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await api.setChoreDone(entry.id, date, !entry.done.includes(date));
      reload();
    } catch (error) {
      window.alert(errorText(error));
    } finally {
      setBusy(false);
    }
  };
};

/** "⭐ Luca 4 · Sofia 6": chores done this week by each child; buttonOnly (dashboard) shows only the button to the detail. */
export const StarsLine = ({
  entries,
  day,
  membersById,
  buttonOnly = false
}: {
  entries: ScheduleEntry[];
  day: Date;
  membersById: Map<string, User>;
  buttonOnly?: boolean;
}) => {
  const [detail, setDetail] = useState(false);
  const stars = [...weekStars(entries, day)].filter(([memberId]) => membersById.has(memberId));
  if (stars.length === 0) {
    return null;
  }
  const dialog = detail ? (
    <StarsDetail entries={entries} day={day} membersById={membersById} memberIds={stars.map(([memberId]) => memberId)} onClose={() => setDetail(false)} />
  ) : null;
  if (buttonOnly) {
    return (
      <div className="chore-stars">
        <Button size="small" appearance="secondary" onClick={() => setDetail(true)}>
          ⭐ Stelline della settimana
        </Button>
        {dialog}
      </div>
    );
  }
  return (
    <div className="chore-stars" aria-label="Stelline della settimana">
      <span className="eyebrow">Stelline della settimana</span>
      {stars.map(([memberId, count]) => (
        <span key={memberId} className="chore-stars__member" style={{ borderColor: membersById.get(memberId)!.color }}>
          {membersById.get(memberId)!.displayName}
          <strong>
            {"⭐"} {count}
          </strong>
        </span>
      ))}
      <Button size="small" appearance="subtle" className="chore-stars__detail" onClick={() => setDetail(true)} aria-label="Dettaglio delle stelline">
        Dettaglio
      </Button>
      {dialog}
    </div>
  );
};

/** Chores done by each child on each day of the week: what the stars are made of. */
const StarsDetail = ({
  entries,
  day,
  membersById,
  memberIds,
  onClose
}: {
  entries: ScheduleEntry[];
  day: Date;
  membersById: Map<string, User>;
  memberIds: string[];
  onClose: () => void;
}) => {
  const monday = startOfWeek(day);
  const week = Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
  const chores = entries.filter((entry) => entry.kind === "chore" && entry.memberId);
  const doneOn = (memberId: string, date: Date) => chores.filter((entry) => entry.memberId === memberId && entry.done.includes(dayKey(date)));
  const dueOn = (memberId: string, date: Date) => scheduleForDay(chores, date).filter((entry) => entry.memberId === memberId);

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog stars-dialog">
        <DialogBody>
          <CloseableDialogTitle>Stelline · settimana dal {monday.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            {memberIds.map((memberId) => {
              const member = membersById.get(memberId)!;
              return (
                <section key={memberId} className="stars-member" style={{ borderLeftColor: member.color }}>
                  <h4>
                    {member.displayName} · ⭐ {week.reduce((total, date) => total + doneOn(memberId, date).length, 0)}
                  </h4>
                  <ul>
                    {week.map((date) => {
                      const done = doneOn(memberId, date);
                      const missed = dueOn(memberId, date).filter((entry) => !done.includes(entry));
                      return (
                        <li key={dayKey(date)}>
                          <strong>{date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })}</strong>
                          <span>
                            {done.map((entry) => `⭐ ${entry.title}`).join(" · ")}
                            {done.length > 0 && missed.length > 0 ? " · " : ""}
                            {missed.length > 0 ? <em>{missed.map((entry) => `○ ${entry.title}`).join(" · ")}</em> : null}
                            {done.length === 0 && missed.length === 0 ? "—" : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>Chiudi</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export const ScheduleChip = ({
  entry,
  membersById,
  onOpen,
  done = false,
  onToggleDone
}: {
  entry: ScheduleEntry;
  membersById: Map<string, User>;
  onOpen?: () => void;
  done?: boolean;
  onToggleDone?: () => void;
}) => {
  const who = entryWho(entry, membersById);
  const time = entryTime(entry);
  const content = (
    <>
      <span className="schedule-chip__icon" aria-hidden="true">{entryIcon(entry)}</span>
      <span className="schedule-chip__text">
        <strong>{entry.title}</strong>
        <span>
          {who.color ? <span className="legend-chip__swatch" style={{ background: who.color }} /> : null}
          {who.name}
          {time ? ` · ${time}` : ""}
        </span>
      </span>
    </>
  );
  const className = `schedule-chip schedule-chip--${entry.kind} ${done ? "schedule-chip--done" : ""}`.trim();
  const style = who.color ? { borderLeftColor: who.color } : undefined;
  const chip = onOpen ? (
    <button type="button" className={className} style={style} onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
  if (entry.kind !== "chore" || (!onToggleDone && !done)) {
    return chip;
  }
  return (
    <div className="schedule-chip-row">
      {chip}
      <button
        type="button"
        className={`chore-check ${done ? "chore-check--done" : ""}`.trim()}
        aria-pressed={done}
        aria-label={done ? `${entry.title}: fatto (tocca per annullare)` : `Segna fatto: ${entry.title}`}
        disabled={!onToggleDone}
        onClick={onToggleDone}
      >
        ✓
      </button>
    </div>
  );
};

interface FormState {
  kind: ScheduleKind;
  title: string;
  memberId: string;
  person: string;
  repeat: "weekly" | "once";
  weekdays: number[];
  weekParity: WeekParity;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
}

const formFromEntry = (entry: ScheduleEntry | null): FormState => ({
  kind: entry?.kind ?? "work",
  title: entry?.title ?? WORK_MODES[0]!,
  memberId: entry?.memberId ?? "",
  person: entry?.person ?? "",
  repeat: entry?.date ? "once" : "weekly",
  weekdays: entry?.weekdays ?? [],
  weekParity: entry?.weekParity ?? "all",
  date: entry?.date ?? dayKey(new Date()),
  startTime: entry?.startTime ?? "",
  endTime: entry?.endTime ?? "",
  note: entry?.note ?? ""
});

const DEFAULT_TITLES: Record<ScheduleKind, string> = { work: WORK_MODES[0]!, chore: "Apparecchiare", presence: "Pulizie" };

const ScheduleDialog = ({ entry, members, onClose, onSaved }: { entry: ScheduleEntry | null; members: User[]; onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState<FormState>(() => formFromEntry(entry));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const candidates = members.filter((member) =>
    form.kind === "work" ? member.role === "Admin" || member.role === "Parent" : form.kind === "chore" ? member.role === "Child" : true
  );
  const suggestions = form.kind === "chore" ? CHORE_SUGGESTIONS : PRESENCE_SUGGESTIONS;

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

  const save = () => {
    const input: ScheduleEntryInput = {
      kind: form.kind,
      title: form.title.trim(),
      memberId: form.memberId || null,
      person: form.kind === "presence" ? form.person.trim() || null : null,
      weekdays: form.repeat === "weekly" ? form.weekdays : [],
      weekParity: form.repeat === "weekly" ? form.weekParity : "all",
      date: form.repeat === "once" ? form.date : null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      note: form.note.trim() || null
    };
    void run(() => (entry ? api.updateScheduleEntry(entry.id, input) : api.createScheduleEntry(input)));
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>{entry ? "Modifica turno" : "Nuovo turno"}</CloseableDialogTitle>
          <DialogContent className="calendar-detail-form">
            <div className="calendar-detail-row">
              <label htmlFor="schedule-kind">Tipo</label>
              <select
                id="schedule-kind"
                value={form.kind}
                onChange={(change) => {
                  const kind = change.target.value as ScheduleKind;
                  update({ kind, title: DEFAULT_TITLES[kind], memberId: "" });
                }}
              >
                {(Object.keys(KIND_LABELS) as ScheduleKind[]).map((kind) => (
                  <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
                ))}
              </select>
            </div>

            <div className="calendar-detail-row">
              <label htmlFor="schedule-title">{form.kind === "work" ? "Dove lavora" : form.kind === "chore" ? "Faccenda" : "Chi viene / per cosa"}</label>
              {form.kind === "work" ? (
                <select id="schedule-title" value={form.title} onChange={(change) => update({ title: change.target.value })}>
                  {WORK_MODES.map((mode) => (
                    <option key={mode} value={mode}>{mode}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input id="schedule-title" list="schedule-suggestions" value={form.title} onChange={(change) => update({ title: change.target.value })} />
                  <datalist id="schedule-suggestions">
                    {suggestions.map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                  </datalist>
                </>
              )}
            </div>

            {form.kind === "presence" ? (
              <div className="calendar-detail-row">
                <label htmlFor="schedule-person">Nome</label>
                <input id="schedule-person" placeholder="Es. Maria" value={form.person} onChange={(change) => update({ person: change.target.value })} />
              </div>
            ) : null}

            <div className="calendar-detail-row">
              <label htmlFor="schedule-member">{form.kind === "presence" ? "Membro della famiglia (facoltativo)" : form.kind === "work" ? "Genitore" : "Bambino"}</label>
              <select id="schedule-member" value={form.memberId} onChange={(change) => update({ memberId: change.target.value })}>
                <option value="">{form.kind === "presence" ? "Nessuno" : "Scegli..."}</option>
                {(candidates.length > 0 ? candidates : members).map((member) => (
                  <option key={member.id} value={member.id}>{member.displayName}</option>
                ))}
              </select>
            </div>

            <div className="calendar-detail-row">
              <label htmlFor="schedule-repeat">Quando</label>
              <select id="schedule-repeat" value={form.repeat} onChange={(change) => update({ repeat: change.target.value as FormState["repeat"] })}>
                <option value="weekly">Ogni settimana</option>
                <option value="once">Solo un giorno</option>
              </select>
            </div>

            {form.repeat === "weekly" ? (
              <>
                <div className="weekday-picker" role="group" aria-label="Giorni">
                  {WEEKDAY_LABELS.map((day) => {
                    const selected = form.weekdays.includes(day.iso);
                    return (
                      <button
                        key={day.iso}
                        type="button"
                        className={`weekday-chip ${selected ? "weekday-chip--selected" : ""}`.trim()}
                        aria-pressed={selected}
                        onClick={() => update({ weekdays: selected ? form.weekdays.filter((iso) => iso !== day.iso) : [...form.weekdays, day.iso] })}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
                <div className="calendar-detail-row">
                  <label htmlFor="schedule-parity">Settimane</label>
                  <select id="schedule-parity" value={form.weekParity} onChange={(change) => update({ weekParity: change.target.value as WeekParity })}>
                    <option value="all">Tutte</option>
                    <option value="even">Solo settimane pari (alternate)</option>
                    <option value="odd">Solo settimane dispari (alternate)</option>
                  </select>
                  <span className="calendar-detail-hint">Questa settimana è {isoWeek(new Date()) % 2 === 0 ? "pari" : "dispari"}.</span>
                </div>
              </>
            ) : (
              <div className="calendar-detail-row">
                <label htmlFor="schedule-date">Giorno</label>
                <input id="schedule-date" type="date" value={form.date} onChange={(change) => update({ date: change.target.value })} />
              </div>
            )}

            <div className="calendar-detail-grid">
              <div className="calendar-detail-row">
                <label htmlFor="schedule-start">Dalle (facoltativo)</label>
                <input id="schedule-start" type="time" value={form.startTime} onChange={(change) => update({ startTime: change.target.value })} />
              </div>
              <div className="calendar-detail-row">
                <label htmlFor="schedule-end">Alle</label>
                <input id="schedule-end" type="time" value={form.endTime} onChange={(change) => update({ endTime: change.target.value })} />
              </div>
            </div>

            <Field label="Nota">
              <input className="native-select" value={form.note} onChange={(change) => update({ note: change.target.value })} placeholder="Es. porta le chiavi" />
            </Field>

            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            {entry ? (
              <Button appearance="secondary" disabled={busy} onClick={() => (window.confirm("Eliminare il turno?") ? void run(() => api.deleteScheduleEntry(entry.id)) : undefined)}>
                Elimina
              </Button>
            ) : null}
            <Button appearance="secondary" onClick={onClose}>Annulla</Button>
            <Button appearance="primary" disabled={busy || !form.title.trim()} onClick={save}>Salva</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
