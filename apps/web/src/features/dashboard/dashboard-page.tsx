import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "@fluentui/react-components";
import { Link } from "react-router-dom";
import { scheduleForDay, type FamilyNote, type FamilyTaskList, type ScheduleKind, type User } from "@familywall/shared";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { useNow } from "@/components/live-clock";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { eventBackground, eventColors, type PlannerEvent } from "@/features/calendar/calendar-page";
import { addDays, eventBounds, startOfDay } from "@/features/calendar/calendar-time";
import { ScheduleChip } from "@/features/schedule/schedule-page";
import { KIND_LABELS } from "@/features/schedule/schedule-labels";
import { Screensaver } from "./screensaver";

const REFRESH_MS = 5 * 60 * 1000;
/** Wall panels (Kiosk accounts) start the screensaver after this much inactivity on the dashboard. */
const KIOSK_IDLE_MS = 5 * 60 * 1000;
const LIST_ITEMS = 10;
const NOTES_SHOWN = 4;

const timeOf = (date: Date) => date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

const relative = (start: Date, end: Date, now: Date): string => {
  if (start <= now) {
    return `in corso, fino alle ${timeOf(end)}`;
  }
  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (minutes < 60) {
    return `tra ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return `tra ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
};

/** Lists chosen for the dashboard; without a choice, the shopping list (or the first list). */
const dashboardLists = (lists: FamilyTaskList[], chosen: string[]): FamilyTaskList[] => {
  const selected = lists.filter((list) => chosen.includes(list.id));
  if (selected.length > 0) {
    return selected;
  }
  const fallback = lists.find((list) => /spesa|shopping|grocer/i.test(list.name)) ?? lists[0];
  return fallback ? [fallback] : [];
};

/** Notes marked "in dashboard"; without any, the pinned and most recent ones. */
const dashboardNotes = (notes: FamilyNote[]): FamilyNote[] => {
  const marked = notes.filter((note) => note.onDashboard);
  return (marked.length > 0 ? marked : notes).slice(0, NOTES_SHOWN);
};

export const DashboardPage = () => {
  const auth = useAuth();
  const now = useNow();
  const todayKey = startOfDay(now).getTime();
  const [screensaver, setScreensaver] = useState(false);

  const from = new Date(todayKey).toISOString();
  const to = addDays(new Date(todayKey), 1).toISOString();
  const calendar = useAsyncResource(() => api.getCalendar(from, to), [from, to]);
  const members = useAsyncResource(() => api.getMembers(), []);
  const lists = useAsyncResource(() => api.getLists(), []);
  const notes = useAsyncResource(() => api.getNotes(), []);
  const schedule = useAsyncResource(() => api.getSchedule(), []);
  const settings = useAsyncResource(() => api.getSettings(), []);

  const reloadAll = useCallback(() => {
    calendar.reload();
    lists.reload();
    notes.reload();
    schedule.reload();
    settings.reload();
  }, [calendar.reload, lists.reload, notes.reload, schedule.reload, settings.reload]);

  useEffect(() => {
    const timer = window.setInterval(reloadAll, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reloadAll]);

  const membersById = useMemo(() => new Map((members.data ?? []).map((member) => [member.id, member])), [members.data]);

  const { allDay, upcoming, meals } = useMemo(() => {
    const entries = (calendar.data?.calendars ?? []).flatMap((entry) =>
      entry.events.map((event) => ({ ...event, calendarColor: entry.color, calendarName: entry.name, kind: entry.kind ?? "events" }))
    );
    const events = entries.filter((event) => event.kind === "events");
    return {
      allDay: events.filter((event) => event.allDay),
      // Today's timed events that have not ended yet, soonest first.
      upcoming: events
        .filter((event) => !event.allDay && eventBounds(event).end > now)
        .sort((left, right) => left.startAt.localeCompare(right.startAt)),
      meals: entries.filter((event) => event.kind === "meals")
    };
  }, [calendar.data, now]);

  const today = scheduleForDay(schedule.data ?? [], now);
  const next = upcoming[0];
  const caption = next ? `${next.title} · ${relative(eventBounds(next).start, eventBounds(next).end, now)}` : undefined;
  const shownLists = dashboardLists(lists.data?.lists ?? [], settings.data?.dashboardListIds ?? []);
  const shownNotes = dashboardNotes(notes.data ?? []);

  const exitScreensaver = useCallback(() => setScreensaver(false), []);
  useKioskIdle(auth.user?.role === "Kiosk" && !screensaver, () => setScreensaver(true));

  return (
    <AppShell
      compact
      currentRoute="/"
      eyebrow="Oggi"
      title={now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
      subtitle=""
      summaryChip={`${upcoming.length} in programma`}
      toolbarActions={<Button appearance="primary" onClick={() => setScreensaver(true)}>Screensaver</Button>}
    >
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <Card className="panel-card dashboard-clock" aria-label="Ora">
            <div className="dashboard-clock__inner">
              <strong>{timeOf(now)}</strong>
              <div>
                <span>{now.toLocaleDateString("it-IT", { weekday: "long" })}</span>
                <span>{now.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            </div>
          </Card>

          <Card className="panel-card dashboard-today">
            <div className="panel-card__header">
              <div>
                <p className="eyebrow">Agenda</p>
                <h3>Ancora oggi</h3>
              </div>
              <Link to="/calendar" className="dashboard-link">Calendario →</Link>
            </div>

            {allDay.length > 0 || meals.length > 0 ? (
              <div className="dashboard-chips">
                {allDay.map((event) => (
                  <span key={event.id} className="dashboard-chip" style={{ borderColor: eventColors(event, membersById)[0] }}>
                    {event.title}
                  </span>
                ))}
                {meals.map((meal) => (
                  <span key={meal.id} className="dashboard-chip dashboard-chip--meal" style={{ borderColor: meal.calendarColor }}>
                    🍲 {meal.title}
                  </span>
                ))}
              </div>
            ) : null}

            {calendar.status === "loading" && !calendar.data ? (
              <p className="calendar-detail-hint">Caricamento...</p>
            ) : calendar.status === "error" ? (
              <p className="form-error">{calendar.error.message}</p>
            ) : upcoming.length === 0 ? (
              <p className="dashboard-empty">Nessun altro impegno per oggi.</p>
            ) : (
              <ol className="dashboard-events">
                {upcoming.map((event, index) => (
                  <DashboardEvent key={event.id} event={event} membersById={membersById} now={now} highlight={index === 0} />
                ))}
              </ol>
            )}
          </Card>
          {today.length > 0 ? (
            <Card className="panel-card dashboard-home">
              <div className="panel-card__header">
                <div>
                  <p className="eyebrow">Oggi in casa</p>
                  <h3>Turni</h3>
                </div>
                <Link to="/schedule" className="dashboard-link">Turni →</Link>
              </div>
              {(["work", "chore", "presence"] as ScheduleKind[]).map((kind) => {
                const entries = today.filter((entry) => entry.kind === kind);
                return entries.length > 0 ? (
                  <div key={kind} className="dashboard-home__group">
                    <span className="eyebrow">{KIND_LABELS[kind]}</span>
                    <div className="dashboard-home__chips">
                      {entries.map((entry) => (
                        <ScheduleChip key={entry.id} entry={entry} membersById={membersById} />
                      ))}
                    </div>
                  </div>
                ) : null;
              })}
            </Card>
          ) : null}

        </div>

        <div className="dashboard-side-column">
          {lists.status === "error" ? (
            <Card className="panel-card dashboard-side">
              <p className="form-error">{lists.error.message}</p>
            </Card>
          ) : shownLists.length === 0 ? (
            <Card className="panel-card dashboard-side">
              <p className="calendar-detail-hint">Nessuna lista collegata.</p>
            </Card>
          ) : (
            shownLists.map((list) => <DashboardList key={list.id} list={list} />)
          )}

          <Card className="panel-card dashboard-side">
            <div className="panel-card__header">
              <div>
                <p className="eyebrow">Bacheca</p>
                <h3>Note</h3>
              </div>
              <Link to="/notes" className="dashboard-link">Tutte →</Link>
            </div>
            {shownNotes.length === 0 ? (
              <p className="calendar-detail-hint">Nessuna nota.</p>
            ) : (
              <div className="dashboard-notes">
                {shownNotes.map((note) => (
                  <DashboardNote key={note.id} note={note} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {screensaver ? <Screensaver caption={caption} onExit={exitScreensaver} /> : null}
    </AppShell>
  );
};

const DashboardList = ({ list }: { list: FamilyTaskList }) => {
  const open = list.tasks.filter((task) => !task.completed);
  return (
    <Card className="panel-card dashboard-side" style={{ borderTop: `6px solid ${list.color}` }}>
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Lista</p>
          <h3>{list.name}</h3>
        </div>
        <Link to="/lists" className="dashboard-link">Liste →</Link>
      </div>
      {open.length === 0 ? (
        <p className="dashboard-empty">Tutto fatto.</p>
      ) : (
        <ul className="dashboard-shopping">
          {open.slice(0, LIST_ITEMS).map((task) => (
            <li key={task.id}>
              <span className="dashboard-shopping__dot" style={{ background: list.color }} />
              {task.title}
            </li>
          ))}
          {open.length > LIST_ITEMS ? <li className="calendar-detail-hint">e altre {open.length - LIST_ITEMS}...</li> : null}
        </ul>
      )}
    </Card>
  );
};

const DashboardEvent = ({ event, membersById, now, highlight }: { event: PlannerEvent; membersById: Map<string, User>; now: Date; highlight: boolean }) => {
  const colors = eventColors(event, membersById);
  const { start, end } = eventBounds(event);
  const people = event.memberIds.map((id) => membersById.get(id)).filter((member): member is User => Boolean(member));
  return (
    <li className={`dashboard-event ${highlight ? "dashboard-event--next" : ""}`.trim()} style={{ background: eventBackground(colors) }}>
      <span className="planner-event__bar" aria-hidden="true">
        {colors.map((color) => (
          <span key={color} style={{ background: color }} />
        ))}
      </span>
      <div className="dashboard-event__time">
        <strong>{timeOf(start)}</strong>
        <span>{timeOf(end)}</span>
      </div>
      <div className="dashboard-event__body">
        {highlight ? <span className="today-pill">{start <= now ? "Adesso" : "Prossimo"}</span> : null}
        <strong>{event.title}</strong>
        <span className="calendar-detail-hint">
          {relative(start, end, now)}
          {people.length > 0 ? ` · ${people.map((member) => member.displayName).join(", ")}` : ""}
        </span>
      </div>
    </li>
  );
};

const DashboardNote = ({ note }: { note: FamilyNote }) => (
  <article className="dashboard-note" style={{ background: note.color }}>
    {note.title ? <strong>{note.title}</strong> : null}
    {note.body ? <p>{note.body}</p> : null}
  </article>
);

/** Calls onIdle after a period without touches, clicks or keys (only while enabled). */
const useKioskIdle = (enabled: boolean, onIdle: () => void) => {
  const callback = useRef(onIdle);
  callback.current = onIdle;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let timer = window.setTimeout(() => callback.current(), KIOSK_IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), KIOSK_IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [enabled]);
};
