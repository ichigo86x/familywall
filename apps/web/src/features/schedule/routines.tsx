import { useState } from "react";
import { Button, Card, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, Field, Input, Textarea } from "@fluentui/react-components";
import {
  ROUTINE_TEMPLATES,
  canTickChore,
  parseRoutineStep,
  routineActiveAt,
  routineDoneOn,
  routineMinutesLeft,
  routineSchema,
  type Routine,
  type RoutineInput,
  type User
} from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { dayKey } from "@/features/calendar/calendar-time";
import { AddRegular, DeleteRegular } from "@/lib/fluent-icons";
import { WEEKDAY_LABELS } from "./schedule-labels";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

const countdown = (minutes: number): string =>
  minutes > 60
    ? `alle ${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : minutes > 0
      ? `mancano ${minutes} min`
      : minutes === 0
        ? "è ora!"
        : `in ritardo di ${-minutes} min`;

/** Routines running now, as big step tiles on the dashboard; nothing when none is running. */
export const ActiveRoutines = ({
  routines,
  now,
  viewer,
  membersById,
  onChanged
}: {
  routines: Routine[];
  now: Date;
  viewer: User | null;
  membersById: Map<string, User>;
  onChanged: () => void;
}) => {
  const active = routines.filter((routine) => routineActiveAt(routine, now));
  if (active.length === 0) {
    return null;
  }
  return (
    <div className="routine-cards">
      {active.map((routine) => (
        <RoutineCard key={routine.id} routine={routine} now={now} viewer={viewer} member={routine.memberId ? membersById.get(routine.memberId) : undefined} onChanged={onChanged} />
      ))}
    </div>
  );
};

const RoutineCard = ({ routine, now, viewer, member, onChanged }: { routine: Routine; now: Date; viewer: User | null; member?: User; onChanged: () => void }) => {
  const [pending, setPending] = useState<number | null>(null);
  const [optimistic, setOptimistic] = useState<number[] | null>(null);
  const done = optimistic ?? routineDoneOn(routine, now);
  const canTick = Boolean(viewer && canTickChore(viewer, { kind: "chore", memberId: routine.memberId ?? viewer.id }));
  const minutes = routineMinutesLeft(routine, now);
  const finished = done.length >= routine.steps.length;

  const toggle = async (step: number) => {
    if (!canTick || pending !== null) {
      return;
    }
    const next = done.includes(step) ? done.filter((value) => value !== step) : [...done, step];
    setOptimistic(next);
    setPending(step);
    try {
      await api.setRoutineStep(routine.id, dayKey(now), step, !done.includes(step));
      onChanged();
    } catch (error) {
      window.alert(errorText(error));
    } finally {
      setOptimistic(null);
      setPending(null);
    }
  };

  return (
    <Card className={`panel-card routine-card ${finished ? "routine-card--done" : ""}`.trim()} style={member ? { borderTopColor: member.color } : undefined}>
      <div className="routine-card__header">
        <div>
          <p className="eyebrow">
            Routine · {routine.startTime}–{routine.endTime}
          </p>
          <h3>
            {member ? `${member.displayName}: ` : ""}
            {routine.title}
          </h3>
        </div>
        <div className={`routine-card__clock ${minutes < 0 && !finished ? "routine-card__clock--late" : ""}`.trim()}>
          {finished ? "🎉 Fatto!" : countdown(minutes)}
          <span>
            {done.length}/{routine.steps.length}
          </span>
        </div>
      </div>
      <div className="routine-card__progress" aria-hidden="true">
        <span style={{ width: `${Math.round((done.length / routine.steps.length) * 100)}%` }} />
      </div>
      <div className="routine-card__steps">
        {routine.steps.map((step, index) => (
          <button
            key={index}
            type="button"
            className={`routine-step ${done.includes(index) ? "routine-step--done" : ""}`.trim()}
            aria-pressed={done.includes(index)}
            disabled={!canTick}
            onClick={() => void toggle(index)}
          >
            <span className="routine-step__icon" aria-hidden="true">
              {done.includes(index) ? "✅" : step.icon}
            </span>
            <span className="routine-step__label">{step.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
};

/** The routines of the family on the Turni page, editable by Admins and Parents. */
export const RoutinesCard = ({
  routines,
  members,
  canWrite,
  onChanged
}: {
  routines: Routine[];
  members: User[];
  canWrite: boolean;
  onChanged: () => void;
}) => {
  const [editing, setEditing] = useState<Routine | "mattina" | "sera" | null>(null);
  const byId = new Map(members.map((member) => [member.id, member]));
  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Mattina e sera</p>
          <h3>Routine dei bambini</h3>
        </div>
        {canWrite ? (
          <div className="row-actions">
            <Button icon={<AddRegular />} onClick={() => setEditing("mattina")}>Mattina</Button>
            <Button icon={<AddRegular />} onClick={() => setEditing("sera")}>Sera</Button>
          </div>
        ) : null}
      </div>
      {routines.length === 0 ? (
        <p className="calendar-detail-hint">
          Nessuna routine. Una routine mostra in dashboard i passi da fare (vestirsi, colazione, denti, zaino) con il conto alla rovescia fino
          all'uscita; i bambini li spuntano dal pannello.
        </p>
      ) : (
        <div className="stack-list">
          {routines.map((routine) => (
            <article key={routine.id} className="routine-row">
              <div>
                <strong>
                  {routine.memberId && byId.get(routine.memberId) ? `${byId.get(routine.memberId)!.displayName}: ` : ""}
                  {routine.title}
                </strong>
                <p className="calendar-detail-hint">
                  {routine.weekdays.map((weekday) => WEEKDAY_LABELS[weekday - 1]!.short).join(" ")} · {routine.startTime}–{routine.endTime} ·{" "}
                  {routine.steps.map((step) => step.icon).join(" ")}
                </p>
              </div>
              {canWrite ? (
                <div className="row-actions">
                  <Button onClick={() => setEditing(routine)}>Modifica</Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {editing ? (
        <RoutineDialog
          routine={typeof editing === "string" ? null : editing}
          template={typeof editing === "string" ? editing : "mattina"}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </Card>
  );
};

const RoutineDialog = ({
  routine,
  template,
  members,
  onClose,
  onSaved
}: {
  routine: Routine | null;
  template: "mattina" | "sera";
  members: User[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const base = routine ?? { ...ROUTINE_TEMPLATES[template], memberId: null, weekdays: template === "mattina" ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7] };
  const [title, setTitle] = useState(base.title);
  const [memberId, setMemberId] = useState<string | null>(base.memberId);
  const [weekdays, setWeekdays] = useState<number[]>(base.weekdays);
  const [startTime, setStartTime] = useState(base.startTime);
  const [endTime, setEndTime] = useState(base.endTime);
  const [steps, setSteps] = useState(base.steps.map((step) => `${step.icon} ${step.label}`).join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const input: RoutineInput = {
      title,
      memberId,
      weekdays,
      startTime,
      endTime,
      steps: steps
        .split("\n")
        .map(parseRoutineStep)
        .filter((step): step is NonNullable<typeof step> => step !== null)
    };
    const parsed = routineSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dati non validi.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (routine) {
        await api.updateRoutine(routine.id, input);
      } else {
        await api.createRoutine(input);
      }
      onSaved();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (routine && window.confirm(`Eliminare la routine "${routine.title}"?`)) {
      try {
        await api.deleteRoutine(routine.id);
        onSaved();
      } catch (caught) {
        setError(errorText(caught));
      }
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>{routine ? "Modifica routine" : "Nuova routine"}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <Field label="Nome">
              <Input value={title} onChange={(_, data) => setTitle(data.value)} />
            </Field>
            <Field label="Per">
              <select className="native-select" value={memberId ?? ""} onChange={(change) => setMemberId(change.target.value || null)}>
                <option value="">Tutta la famiglia</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Giorni">
              <div className="weekday-picker" role="group" aria-label="Giorni">
                {WEEKDAY_LABELS.map((day) => {
                  const selected = weekdays.includes(day.iso);
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      className={`weekday-chip ${selected ? "weekday-chip--selected" : ""}`.trim()}
                      aria-pressed={selected}
                      onClick={() => setWeekdays((current) => (selected ? current.filter((iso) => iso !== day.iso) : [...current, day.iso].sort()))}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="calendar-detail-grid">
              <div className="calendar-detail-row">
                <label htmlFor="routine-start">In dashboard dalle</label>
                <input id="routine-start" type="time" value={startTime} onChange={(change) => setStartTime(change.target.value)} />
              </div>
              <div className="calendar-detail-row">
                <label htmlFor="routine-end">Pronti per le</label>
                <input id="routine-end" type="time" value={endTime} onChange={(change) => setEndTime(change.target.value)} />
              </div>
            </div>
            <Field label="Passi" hint="Uno per riga, con un'emoji davanti (massimo 12)">
              <Textarea resize="vertical" rows={8} value={steps} onChange={(_, data) => setSteps(data.value)} />
            </Field>
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            {routine ? (
              <Button appearance="subtle" icon={<DeleteRegular />} onClick={() => void remove()}>
                Elimina
              </Button>
            ) : null}
            <Button appearance="secondary" onClick={onClose}>Annulla</Button>
            <Button appearance="primary" disabled={busy} onClick={() => void save()}>
              Salva
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
