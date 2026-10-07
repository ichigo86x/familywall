import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@fluentui/react-components";
import { Link } from "react-router-dom";
import { scheduleForDay, type FamilyNote, type FamilyTaskList, type ScheduleEntry, type ScheduleKind, type User } from "@familywall/shared";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { useNow } from "@/components/live-clock";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { eventBackground, eventColors, type PlannerEvent } from "@/features/calendar/calendar-page";
import { addDays, birthdayTitle, eventBounds, occursOnDay, startOfDay } from "@/features/calendar/calendar-time";
import { ScheduleChip } from "@/features/schedule/schedule-page";
import { KIND_LABELS } from "@/features/schedule/schedule-labels";
import { AddRegular } from "@/lib/fluent-icons";
import { ActionBar } from "./action-bar";
import { WeatherClock } from "./weather-clock";

const REFRESH_MS = 5 * 60 * 1000;
const LIST_ITEMS = 10;
const NOTES_SHOWN = 4;
/** Days covered by the dashboard: today, tomorrow and the "next days" card. */
const DAYS_AHEAD = 7;
/** Birthdays and anniversaries are announced this many days ahead. */
const BIRTHDAY_DAYS = 30;
/** From this hour the parents' work shows tomorrow's plan instead of today's. */
const WORK_TOMORROW_HOUR = 18;
const TOMORROW_ROWS = 5;
const DAY_CHIPS = 3;

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

const byStart = (left: PlannerEvent, right: PlannerEvent) => left.startAt.localeCompare(right.startAt);

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

const dayLabel = (day: Date) => day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

export const DashboardPage = () => {
  const auth = useAuth();
  const now = useNow();
  const todayKey = startOfDay(now).getTime();
  const today = new Date(todayKey);
  const tomorrow = addDays(today, 1);

  const from = today.toISOString();
  const to = addDays(today, BIRTHDAY_DAYS + 1).toISOString();
  const calendar = useAsyncResource(() => api.getCalendar(from, to), [from, to]);
  const members = useAsyncResource(() => api.getMembers(), []);
  const lists = useAsyncResource(() => api.getLists(), []);
  const notes = useAsyncResource(() => api.getNotes(), []);
  const schedule = useAsyncResource(() => api.getSchedule(), []);
  const settings = useAsyncResource(() => api.getSettings(), []);
  const weather = useAsyncResource(() => api.getWeather().catch(() => null), []);

  const reloadAll = useCallback(() => {
    calendar.reload();
    lists.reload();
    notes.reload();
    schedule.reload();
    settings.reload();
    weather.reload();
  }, [calendar.reload, lists.reload, notes.reload, schedule.reload, settings.reload, weather.reload]);

  useEffect(() => {
    const timer = window.setInterval(reloadAll, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reloadAll]);

  // A failed forecast (slow network at boot) is retried after a minute instead of waiting for the next refresh.
  const weatherMissing = Boolean(settings.data?.weatherLocation) && weather.status !== "loading" && !weather.data;
  useEffect(() => {
    if (!weatherMissing) {
      return;
    }
    const timer = window.setTimeout(weather.reload, 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [weatherMissing, weather.reload]);

  const membersById = useMemo(() => new Map((members.data ?? []).map((member) => [member.id, member])), [members.data]);

  const { events, meals, birthdays } = useMemo(() => {
    const entries: Array<PlannerEvent & { kind: "events" | "meals" | "birthdays" }> = (calendar.data?.calendars ?? []).flatMap((entry) =>
      entry.events.map((event) => ({
        ...event,
        title: entry.kind === "birthdays" ? birthdayTitle(event.title) : event.title,
        calendarColor: entry.color,
        calendarName: entry.name,
        kind: entry.kind ?? "events"
      }))
    );
    return {
      events: entries.filter((event) => event.kind !== "meals").sort(byStart),
      meals: entries.filter((event) => event.kind === "meals"),
      birthdays: entries.filter((event) => event.kind === "birthdays").sort(byStart)
    };
  }, [calendar.data]);

  const onDay = (day: Date) => events.filter((event) => occursOnDay(event, day));
  const todayEvents = onDay(today);
  const upcoming = todayEvents.filter((event) => !event.allDay && eventBounds(event).end > now);
  const todayAllDay = todayEvents.filter((event) => event.allDay);
  const tomorrowEvents = onDay(tomorrow);
  const nextDays = Array.from({ length: DAYS_AHEAD - 2 }, (_, index) => addDays(today, index + 2));
  const mealsOn = (day: Date) => meals.filter((meal) => occursOnDay(meal, day));

  const shownLists = dashboardLists(lists.data?.lists ?? [], settings.data?.dashboardListIds ?? []);
  const shownNotes = dashboardNotes(notes.data ?? []);

  return (
    <AppShell
      headless
      currentRoute="/"
      eyebrow="Oggi"
      title={dayLabel(now)}
      subtitle=""
      summaryChip={`${upcoming.length} in programma`}
    >
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <WeatherClock now={now} weather={weather.data ?? null} canConfigure={auth.can("settings:manage") && Boolean(settings.data) && !settings.data?.weatherLocation} />

          <div className="dashboard-pair">
            <Card className="panel-card dashboard-today">
              <div className="panel-card__header">
                <div>
                  <p className="eyebrow">Agenda</p>
                  <h3>{upcoming.length > 0 ? "Ancora oggi" : "Oggi"}</h3>
                </div>
                <Link to="/calendar" className="dashboard-link">Calendario →</Link>
              </div>

              <DayChips allDay={todayAllDay} meals={mealsOn(today)} membersById={membersById} />

              {calendar.status === "loading" && !calendar.data ? (
                <p className="calendar-detail-hint">Caricamento...</p>
              ) : calendar.status === "error" ? (
                <p className="form-error">{calendar.error.message}</p>
              ) : upcoming.length === 0 ? (
                <p className="dashboard-empty">
                  <span aria-hidden="true">{todayEvents.some((event) => !event.allDay) ? "✅" : "🌿"}</span>
                  {todayEvents.some((event) => !event.allDay) ? "Giornata conclusa: niente altro per oggi." : "Oggi niente in agenda."}
                </p>
              ) : (
                <ol className="dashboard-events">
                  {upcoming.map((event, index) => (
                    <DashboardEvent key={event.id} event={event} membersById={membersById} now={now} highlight={index === 0} />
                  ))}
                </ol>
              )}

              <section className={`dashboard-tomorrow ${upcoming.length === 0 ? "dashboard-tomorrow--focus" : ""}`.trim()}>
                <h4>
                  Domani <span>· {tomorrow.toLocaleDateString("it-IT", { weekday: "long", day: "numeric" })}</span>
                </h4>
                <DayChips allDay={tomorrowEvents.filter((event) => event.allDay)} meals={mealsOn(tomorrow)} membersById={membersById} />
                {tomorrowEvents.filter((event) => !event.allDay).length === 0 ? (
                  <p className="calendar-detail-hint">{tomorrowEvents.length === 0 ? "Nessun impegno." : "Solo impegni di tutto il giorno."}</p>
                ) : (
                  <ul className="dashboard-compact-events">
                    {tomorrowEvents
                      .filter((event) => !event.allDay)
                      .slice(0, upcoming.length === 0 ? undefined : TOMORROW_ROWS)
                      .map((event) => (
                        <CompactEvent key={event.id} event={event} membersById={membersById} />
                      ))}
                  </ul>
                )}
              </section>
            </Card>

            <Card className="panel-card dashboard-week">
              <div className="panel-card__header">
                <div>
                  <p className="eyebrow">In arrivo</p>
                  <h3>Prossimi giorni</h3>
                </div>
              </div>
              <ul className="dashboard-days">
                {nextDays.map((day) => {
                  const dayEvents = onDay(day);
                  const dayMeals = mealsOn(day);
                  return (
                    <li key={day.getTime()}>
                      <span className="dashboard-days__label">
                        <strong>{day.toLocaleDateString("it-IT", { weekday: "short" })}</strong>
                        <span>{day.getDate()}</span>
                      </span>
                      <span className="dashboard-days__events">
                        {dayEvents.length === 0 ? <span className="dashboard-days__free">Libero</span> : null}
                        {dayEvents.slice(0, DAY_CHIPS).map((event) => (
                          <span key={event.id} className="dashboard-days__event" style={{ borderColor: eventColors(event, membersById)[0] }}>
                            {event.allDay ? "" : `${timeOf(eventBounds(event).start)} `}
                            {event.title}
                          </span>
                        ))}
                        {dayEvents.length > DAY_CHIPS ? <span className="dashboard-days__more">+{dayEvents.length - DAY_CHIPS}</span> : null}
                        {dayMeals.length > 0 ? (
                          <span className="dashboard-days__meal" title={dayMeals.map((meal) => meal.title).join(", ")} aria-label="Pasti pianificati">
                            🍲
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <Card className="panel-card dashboard-side">
            <div className="panel-card__header">
              <div>
                <p className="eyebrow">Bacheca</p>
                <h3>Note</h3>
              </div>
              <Link to="/notes" className="dashboard-link">Tutte →</Link>
            </div>
            {shownNotes.length === 0 ? (
              <p className="dashboard-empty">
                <span aria-hidden="true">📝</span>
                Nessuna nota. Aggiungi codici del wifi, numeri utili o promemoria dalla pagina Note.
              </p>
            ) : (
              <div className="dashboard-notes">
                {shownNotes.map((note) => (
                  <DashboardNote key={note.id} note={note} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="dashboard-side-column">
          <ActionBar canWriteEvents={auth.can("events:write")} canWriteLists={auth.can("lists:write")} />

          <HomeCard entries={schedule.data ?? []} now={now} membersById={membersById} />

          <BirthdaysCard birthdays={birthdays} today={today} />

          {meals.length > 0 ? <MealsCard today={mealsOn(today)} tomorrow={mealsOn(tomorrow)} /> : null}

          {lists.status === "error" ? (
            <Card className="panel-card dashboard-side">
              <p className="form-error">{lists.error.message}</p>
            </Card>
          ) : shownLists.length === 0 ? (
            <Card className="panel-card dashboard-side">
              <p className="dashboard-empty">
                <span aria-hidden="true">🛒</span>
                Nessuna lista collegata.
              </p>
            </Card>
          ) : (
            shownLists.map((list) => <DashboardList key={list.id} list={list} canWrite={auth.can("lists:write")} onChanged={lists.reload} />)
          )}

        </div>
      </div>
    </AppShell>
  );
};

const DayChips = ({ allDay, meals, membersById }: { allDay: PlannerEvent[]; meals: PlannerEvent[]; membersById: Map<string, User> }) =>
  allDay.length > 0 || meals.length > 0 ? (
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
  ) : null;

/** Parents' work, kids' chores and visits; in the evening the work plan switches to tomorrow. */
const HomeCard = ({ entries, now, membersById }: { entries: ScheduleEntry[]; now: Date; membersById: Map<string, User> }) => {
  const todayEntries = scheduleForDay(entries, now);
  const tomorrowEntries = scheduleForDay(entries, addDays(startOfDay(now), 1));
  const evening = now.getHours() >= WORK_TOMORROW_HOUR;
  const groups: Array<{ key: string; label: string; entries: ScheduleEntry[] }> = (["work", "chore", "presence"] as ScheduleKind[]).map((kind) =>
    kind === "work" && evening
      ? { key: kind, label: `${KIND_LABELS[kind]} · domani`, entries: tomorrowEntries.filter((entry) => entry.kind === kind) }
      : { key: kind, label: KIND_LABELS[kind], entries: todayEntries.filter((entry) => entry.kind === kind) }
  );
  const shown = groups.filter((group) => group.entries.length > 0);

  return (
    <Card className="panel-card dashboard-home">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">{evening ? "Stasera e domani" : "Oggi in casa"}</p>
          <h3>Turni</h3>
        </div>
        <Link to="/schedule" className="dashboard-link">Turni →</Link>
      </div>
      {shown.length === 0 ? (
        <p className="dashboard-empty">
          <span aria-hidden="true">🏡</span>
          Nessun turno {evening ? "per stasera e domani" : "oggi"}. Organizza lavoro, faccende e presenze dalla pagina Turni.
        </p>
      ) : (
        shown.map((group) => (
          <div key={group.key} className="dashboard-home__group">
            <span className="eyebrow">{group.label}</span>
            <div className="dashboard-home__chips">
              {group.entries.map((entry) => (
                <ScheduleChip key={entry.id} entry={entry} membersById={membersById} />
              ))}
            </div>
          </div>
        ))
      )}
    </Card>
  );
};

const BirthdaysCard = ({ birthdays, today }: { birthdays: PlannerEvent[]; today: Date }) => {
  const upcoming = birthdays.filter((event) => eventBounds(event).end > today).slice(0, 6);
  const daysUntil = (event: PlannerEvent) => Math.round((eventBounds(event).start.getTime() - today.getTime()) / 86_400_000);
  const when = (days: number, event: PlannerEvent) =>
    days <= 0 ? "oggi 🎉" : days === 1 ? "domani" : days < 7 ? `tra ${days} giorni` : eventBounds(event).start.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return (
    <Card className="panel-card dashboard-side">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Prossimi {BIRTHDAY_DAYS} giorni</p>
          <h3>Compleanni e ricorrenze</h3>
        </div>
        <Link to="/notes" className="dashboard-link">Gestisci →</Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="dashboard-empty">
          <span aria-hidden="true">🎂</span>
          Nessun compleanno in arrivo.
        </p>
      ) : (
        <ul className="dashboard-birthdays">
          {upcoming.map((event) => {
            const days = daysUntil(event);
            return (
              <li key={event.id} className={days <= 0 ? "dashboard-birthdays__today" : ""}>
                <span>{event.title}</span>
                <span>{when(days, event)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

const MealsCard = ({ today, tomorrow }: { today: PlannerEvent[]; tomorrow: PlannerEvent[] }) => (
  <Card className="panel-card dashboard-side">
    <div className="panel-card__header">
      <div>
        <p className="eyebrow">Cucina</p>
        <h3>In tavola</h3>
      </div>
      <Link to="/calendar" className="dashboard-link">Menu →</Link>
    </div>
    {[
      { label: "Oggi", meals: today },
      { label: "Domani", meals: tomorrow }
    ].map((day) => (
      <div key={day.label} className="dashboard-meals">
        <span className="eyebrow">{day.label}</span>
        {day.meals.length === 0 ? (
          <span className="calendar-detail-hint">Niente in programma.</span>
        ) : (
          <ul>
            {day.meals.map((meal) => (
              <li key={meal.id}>🍲 {meal.title}</li>
            ))}
          </ul>
        )}
      </div>
    ))}
  </Card>
);

const DashboardList = ({ list, canWrite, onChanged }: { list: FamilyTaskList; canWrite: boolean; onChanged: () => void }) => {
  const open = list.tasks.filter((task) => !task.completed);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const title = draft.trim();
    if (!title) {
      return;
    }
    setBusy(true);
    try {
      await api.createTask(list.id, title);
      setDraft("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="panel-card dashboard-side" style={{ borderTop: `6px solid ${list.color}` }}>
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Lista · {open.length} da fare</p>
          <h3>{list.name}</h3>
        </div>
        <Link to="/lists" className="dashboard-link">Liste →</Link>
      </div>
      {canWrite ? (
        <form
          className="dashboard-add"
          onSubmit={(submit) => {
            submit.preventDefault();
            void add();
          }}
        >
          <input value={draft} placeholder="Aggiungi..." aria-label={`Aggiungi a ${list.name}`} onChange={(change) => setDraft(change.target.value)} />
          <Button type="submit" appearance="primary" icon={<AddRegular />} aria-label="Aggiungi" disabled={busy || !draft.trim()} />
        </form>
      ) : null}
      {open.length === 0 ? (
        <p className="dashboard-empty">
          <span aria-hidden="true">✨</span>
          Tutto fatto.
        </p>
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

const CompactEvent = ({ event, membersById }: { event: PlannerEvent; membersById: Map<string, User> }) => {
  const colors = eventColors(event, membersById);
  const people = event.memberIds.map((id) => membersById.get(id)?.displayName).filter(Boolean);
  return (
    <li style={{ borderLeftColor: colors[0] }}>
      <strong>{timeOf(eventBounds(event).start)}</strong>
      <span>
        {event.title}
        {people.length > 0 ? <em> · {people.join(", ")}</em> : null}
      </span>
    </li>
  );
};

const DashboardNote = ({ note }: { note: FamilyNote }) => (
  <article className="dashboard-note" style={{ background: note.color }}>
    {note.title ? <strong>{note.title}</strong> : null}
    {note.body ? <p>{note.body}</p> : null}
  </article>
);
