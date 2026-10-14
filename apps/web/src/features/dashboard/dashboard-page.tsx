import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@fluentui/react-components";
import { Link, useSearchParams } from "react-router-dom";
import { UMBRELLA_CHANCE, aisleOf, canTickChore, isShoppingList, panelView, rainChanceDuring, scheduleForDay, type HomePresence, type WeatherReport, type FamilyNote, type FamilyTaskList, type ScheduleEntry, type User } from "@familywall/shared";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { useNow } from "@/components/live-clock";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { eventColors, type PlannerEvent } from "@/features/calendar/calendar-page";
import { addDays, birthdayTitle, dayKey, eventBounds, occursOnDay, startOfDay } from "@/features/calendar/calendar-time";
import { StarsLine, useChoreToggle } from "@/features/schedule/schedule-page";
import { ActiveRoutines } from "@/features/schedule/routines";
import { entryIcon, entryTime } from "@/features/schedule/schedule-labels";
import { AddRegular } from "@/lib/fluent-icons";
import { MemberAvatar } from "@/components/member-avatar";
import { ActionBar } from "./action-bar";
import { SchoolPanel } from "@/features/school/school";
import { WeatherClock } from "./weather-clock";

const REFRESH_MS = 5 * 60 * 1000;
const NOTES_SHOWN = 4;
/** Days covered by the dashboard: today, tomorrow and the "next days" card. */
const DAYS_AHEAD = 7;
/** Birthdays and anniversaries are announced this many days ahead. */
const BIRTHDAY_DAYS = 30;
/** From this hour the parents' work shows tomorrow's plan instead of today's. */
const WORK_TOMORROW_HOUR = 18;
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
  const calendar = useAsyncResource(() => api.getCalendar(from, to), [from, to], `calendar:${from}:${to}`);
  const members = useAsyncResource(() => api.getMembers(), [], "members");
  const lists = useAsyncResource(() => api.getLists(), [], "lists");
  const notes = useAsyncResource(() => api.getNotes(), [], "notes");
  const schedule = useAsyncResource(() => api.getSchedule(), [], "schedule");
  const routines = useAsyncResource(() => api.getRoutines().catch(() => []), [], "routines");
  const settings = useAsyncResource(() => api.getSettings(), [], "settings");
  const weather = useAsyncResource(() => api.getWeather().catch(() => null), [], "weather");
  // "Scuola" in the header shows homework and tests in place of the household cards (#/?scuola=1).
  const [params, setParams] = useSearchParams();
  const schoolOpen = params.get("scuola") === "1";
  const presence = useAsyncResource(() => api.getHomePresence().catch(() => []), [], "presence");

  const reloadAll = useCallback(() => {
    calendar.reload();
    lists.reload();
    notes.reload();
    schedule.reload();
    routines.reload();
    settings.reload();
    weather.reload();
    presence.reload();
  }, [calendar.reload, lists.reload, notes.reload, schedule.reload, routines.reload, settings.reload, weather.reload, presence.reload]);

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
    const entries: Array<PlannerEvent & { kind: "events" | "meals" | "birthdays" | "school" }> = (calendar.data?.calendars ?? []).flatMap((entry) =>
      entry.events.map((event) => ({
        ...event,
        title: entry.kind === "birthdays" ? birthdayTitle(event.title) : event.title,
        calendarColor: entry.color,
        calendarName: entry.name,
        kind: entry.kind ?? "events"
      }))
    );
    return {
      events: entries.filter((event) => event.kind !== "meals" && event.kind !== "school").sort(byStart),
      meals: entries.filter((event) => event.kind === "meals"),
      birthdays: entries.filter((event) => event.kind === "birthdays").sort(byStart)
    };
  }, [calendar.data]);

  const onDay = (day: Date) => events.filter((event) => occursOnDay(event, day));
  const todayEvents = onDay(today);
  const upcoming = todayEvents.filter((event) => !event.allDay && eventBounds(event).end > now);
  const todayAllDay = todayEvents.filter((event) => event.allDay);
  const tomorrowEvents = onDay(tomorrow);
  const mealsOn = (day: Date) => meals.filter((meal) => occursOnDay(meal, day));

  // A panel may have its own lists (kitchen: shopping; hall: things to bring).
  const listIds = settings.data ? panelView({ ...settings.data, panelProfiles: settings.data.panelProfiles ?? {} }, auth.user?.id).dashboardListIds : [];
  const shownLists = dashboardLists(lists.data?.lists ?? [], listIds);
  const shownNotes = dashboardNotes(notes.data ?? []);
  // When nothing is left today, tomorrow moves into the Oggi card and leaves "In arrivo".
  const tomorrowFocus = upcoming.length === 0 && tomorrowEvents.length > 0;
  const nextDays = Array.from({ length: DAYS_AHEAD - 1 }, (_, index) => addDays(today, index + 1)).slice(tomorrowFocus ? 1 : 0);

  return (
    <AppShell
      headless
      dashboard
      currentRoute="/"
      eyebrow="Oggi"
      title={dayLabel(now)}
      subtitle=""
    >
      <div className="dashboard-grid">
        {/* Top row: clock and weather on the left; buttons and birthdays on the right, as tall as the clock. */}
        <WeatherClock now={now} weather={weather.data ?? null} canConfigure={auth.can("settings:manage") && Boolean(settings.data) && !settings.data?.weatherLocation} />
        <Card className="panel-card dashboard-top-side">
          <ActionBar canWriteEvents={auth.can("events:write")} canWriteLists={auth.can("lists:write")} />
          <BirthdayStrip birthdays={birthdays} today={today} />
        </Card>

        <div className="dashboard-main">
          <ActiveRoutines routines={routines.data ?? []} now={now} viewer={auth.user} membersById={membersById} onChanged={routines.reload} />
          <div className="dashboard-pair">
            <Card className="panel-card dashboard-today">
              <div className="panel-card__header">
                <div>
                  <p className="eyebrow">Oggi</p>
                  <h3>{now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</h3>
                </div>
                <Link to="/calendar" className="dashboard-link">Calendario →</Link>
              </div>

              <DayChips allDay={todayAllDay} membersById={membersById} />
              <UmbrellaLine weather={weather.data ?? null} events={[...upcoming, ...tomorrowEvents.filter((event) => !event.allDay)]} today={today} />

              {calendar.status === "loading" && !calendar.data ? (
                <p className="calendar-detail-hint">Caricamento...</p>
              ) : calendar.status === "error" ? (
                <p className="form-error">{calendar.error.message}</p>
              ) : upcoming.length === 0 ? (
                <p className="dashboard-agenda__empty">
                  {todayEvents.some((event) => !event.allDay) ? "✅ Giornata conclusa: niente altro per oggi." : "🌿 Oggi niente in agenda."}
                </p>
              ) : (
                <ol className="dashboard-agenda">
                  {upcoming.map((event, index) => (
                    <AgendaRow key={event.id} event={event} membersById={membersById} now={now} next={index === 0} />
                  ))}
                </ol>
              )}
              <MealChips meals={mealsOn(today)} />

              {tomorrowFocus ? (
                <section className="dashboard-tomorrow">
                  <p className="eyebrow">Domani · {tomorrow.toLocaleDateString("it-IT", { weekday: "long", day: "numeric" })}</p>
                  <DayChips allDay={tomorrowEvents.filter((event) => event.allDay)} membersById={membersById} />
                  <ol className="dashboard-agenda">
                    {tomorrowEvents
                      .filter((event) => !event.allDay)
                      .map((event) => (
                        <AgendaRow key={event.id} event={event} membersById={membersById} now={now} next={false} />
                      ))}
                  </ol>
                  <MealChips meals={mealsOn(tomorrow)} />
                </section>
              ) : null}
            </Card>

            <Card className="panel-card dashboard-week">
              <div className="panel-card__header">
                <div>
                  <p className="eyebrow">In arrivo</p>
                  <h3>Prossimi giorni</h3>
                </div>
              </div>
              <ul className="dashboard-days">
                {groupFreeDays(nextDays, (day) => onDay(day).length === 0).map((group) => {
                  const day = group[0]!;
                  const last = group[group.length - 1]!;
                  const dayEvents = onDay(day);
                  const isTomorrow = day.getTime() === tomorrow.getTime();
                  return (
                    <li key={day.getTime()} className={isTomorrow ? "dashboard-days__tomorrow" : undefined}>
                      <span className="dashboard-days__label">
                        <strong>{isTomorrow ? "Domani" : day.toLocaleDateString("it-IT", { weekday: "short" })}</strong>
                        <span>{group.length > 1 ? `${day.getDate()}–${last.getDate()}` : day.getDate()}</span>
                      </span>
                      {dayEvents.length === 0 ? (
                        <span className="dashboard-days__free">
                          {group.length > 1 ? `Liberi fino a ${last.toLocaleDateString("it-IT", { weekday: "long" })}` : "Libero"}
                        </span>
                      ) : (
                        <span className="dashboard-days__events">
                          {dayEvents.slice(0, DAY_CHIPS).map((event) => (
                            <span key={event.id} className="dashboard-days__event" style={{ borderColor: eventColors(event, membersById)[0] }}>
                              {event.allDay ? "" : `${timeOf(eventBounds(event).start)} `}
                              {event.title}
                            </span>
                          ))}
                          {dayEvents.length > DAY_CHIPS ? <span className="dashboard-days__more">+{dayEvents.length - DAY_CHIPS} altri</span> : null}
                        </span>
                      )}
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
          {schoolOpen ? (
            <SchoolPanel today={today} onClose={() => setParams({}, { replace: true })} />
          ) : (
          <>
          <HomeCard
            entries={schedule.data ?? []}
            now={now}
            membersById={membersById}
            viewer={auth.user}
            onChanged={schedule.reload}
            presence={presence.data ?? []}
          />

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
          </>
          )}
        </div>
      </div>
    </AppShell>
  );
};

const DayChips = ({ allDay, membersById }: { allDay: PlannerEvent[]; membersById: Map<string, User> }) =>
  allDay.length > 0 ? (
    <div className="dashboard-chips">
      {allDay.map((event) => (
        <span key={event.id} className="dashboard-chip" style={{ borderColor: eventColors(event, membersById)[0] }}>
          {event.title}
        </span>
      ))}
    </div>
  ) : null;

/** Runs of consecutive free days become one group ("Liberi fino a martedì"); other days stay alone. */
const groupFreeDays = (days: Date[], isFree: (day: Date) => boolean): Date[][] =>
  days.reduce<Date[][]>((groups, day) => {
    const last = groups[groups.length - 1];
    if (last && isFree(day) && isFree(last[0]!)) {
      last.push(day);
    } else {
      groups.push([day]);
    }
    return groups;
  }, []);

/** The dishes of a day as small chips (family menu, Cookidoo, menu calendars). */
const MealChips = ({ meals }: { meals: PlannerEvent[] }) =>
  meals.length > 0 ? (
    <Link to="/menu" className="dashboard-meals" aria-label="In tavola: apri il menu">
      {meals.map((meal) => (
        <span key={meal.id} className="dashboard-chip">🍽️ {meal.title}</span>
      ))}
    </Link>
  ) : null;

/** Home Assistant presence of a member, as the tooltip of the dot on their row. */
const presenceLabel = (entry: HomePresence) =>
  entry.state === "home" ? "a casa" : entry.state === "zone" ? (entry.zone ?? "fuori") : entry.state === "away" ? "fuori" : "posizione sconosciuta";

/** "Porta l'ombrello": the first timed event of today or tomorrow with a high chance of rain. */
const UmbrellaLine = ({ weather, events, today }: { weather: WeatherReport | null; events: PlannerEvent[]; today: Date }) => {
  const wet = events
    .map((event) => ({ event, chance: rainChanceDuring(weather, eventBounds(event).start, eventBounds(event).end) }))
    .find((entry) => entry.chance !== null && entry.chance >= UMBRELLA_CHANCE);
  if (!wet) {
    return null;
  }
  const start = eventBounds(wet.event).start;
  const when = start.toDateString() === today.toDateString() ? "oggi" : "domani";
  return (
    <p className="dashboard-umbrella">
      <strong>☔ Porta l'ombrello</strong>
      <span>
        pioggia al {wet.chance}% {when} alle {start.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · {wet.event.title}
      </span>
    </p>
  );
};

/** Parents' work, kids' chores and visits; in the evening the work plan switches to tomorrow. */
const HomeCard = ({
  entries,
  now,
  membersById,
  viewer,
  onChanged,
  presence
}: {
  entries: ScheduleEntry[];
  now: Date;
  membersById: Map<string, User>;
  viewer: User | null;
  onChanged: () => void;
  presence: HomePresence[];
}) => {
  const toggleDone = useChoreToggle(onChanged);
  const todayKey = dayKey(now);
  const todayEntries = scheduleForDay(entries, now);
  const tomorrowEntries = scheduleForDay(entries, addDays(startOfDay(now), 1));
  const evening = now.getHours() >= WORK_TOMORROW_HOUR;
  // One row per member with something today (in the evening, work is tomorrow's); visitors get their own rows.
  const shown = [
    ...(evening ? tomorrowEntries : todayEntries).filter((entry) => entry.kind === "work"),
    ...todayEntries.filter((entry) => entry.kind !== "work")
  ];
  const presenceOf = new Map(presence.map((entry) => [entry.memberId, entry]));
  const rows = [...membersById.values()]
    .map((member) => ({
      key: member.id,
      member,
      name: member.displayName,
      entries: shown.filter((entry) => entry.memberId === member.id),
      presence: presenceOf.get(member.id)
    }))
    .filter((row) => row.entries.length > 0 || row.presence);
  const visitors = shown.filter((entry) => !entry.memberId);

  return (
    <Card className="panel-card dashboard-home">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">{evening ? "Stasera e domani" : "Oggi in casa"}</p>
        </div>
        <Link to="/schedule" className="dashboard-link">Turni →</Link>
      </div>
      {rows.length === 0 && visitors.length === 0 ? (
        <p className="dashboard-agenda__empty">
          🏡 Nessun turno {evening ? "per stasera e domani" : "oggi"}. Organizza lavoro, faccende e presenze dalla pagina Turni.
        </p>
      ) : (
        <ul className="home-tiles">
          {rows.map((row) => (
            <li key={row.key}>
              <MemberAvatar member={row.member} className="home-tiles__avatar" />
              <span className="home-tiles__body">
                <strong>{row.name}</strong>
                {row.entries.map((entry) => {
                  const done = entry.done.includes(todayKey);
                  const time = entryTime(entry);
                  const label = `${entryIcon(entry)} ${entry.title}${time ? ` · ${time}` : ""}${entry.kind === "work" && evening ? " (domani)" : ""}`;
                  const className = `home-tiles__item ${done ? "home-tiles__item--done" : ""}`.trim();
                  return entry.kind === "chore" && viewer && canTickChore(viewer, entry) ? (
                    <button
                      key={entry.id}
                      type="button"
                      className={className}
                      aria-pressed={done}
                      title={done ? "Fatto: tocca per annullare" : "Tocca quando è fatto"}
                      onClick={() => void toggleDone(entry, todayKey)}
                    >
                      {done ? "✓ " : ""}
                      {label}
                    </button>
                  ) : (
                    <span key={entry.id} className={className}>
                      {done ? "✓ " : ""}
                      {label}
                    </span>
                  );
                })}
              </span>
              {row.presence ? (
                <span className={`home-tiles__presence home-tiles__presence--${row.presence.state}`}>{presenceLabel(row.presence)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="home-tiles__footer">
        {visitors.length > 0 ? (
          <span>
            {visitors.map((entry) => `${entryIcon(entry)} ${entry.title}: ${entry.person ?? ""}${entryTime(entry) ? `, ${entryTime(entry)}` : ""}`).join(" · ")}
          </span>
        ) : null}
        <StarsLine entries={entries} day={now} membersById={membersById} buttonOnly />
      </div>
    </Card>
  );
};

/** Birthdays and anniversaries of the next days, shown only when there are some. */
const BirthdayStrip = ({ birthdays, today }: { birthdays: PlannerEvent[]; today: Date }) => {
  const upcoming = birthdays.filter((event) => eventBounds(event).end > today).slice(0, 6);
  if (upcoming.length === 0) {
    return null;
  }
  const daysUntil = (event: PlannerEvent) => Math.round((eventBounds(event).start.getTime() - today.getTime()) / 86_400_000);
  const when = (days: number, event: PlannerEvent) =>
    days <= 0 ? "oggi 🎉" : days === 1 ? "domani" : days < 7 ? `tra ${days} giorni` : eventBounds(event).start.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return (
    <section className="dashboard-birthday-strip" aria-label="Compleanni e ricorrenze">
      <span className="eyebrow">Ricorrenze</span>
      <ul>
        {upcoming.map((event) => {
          const days = daysUntil(event);
          // birthdayTitle puts an emoji first ("🎂 Nonna Rita"): it becomes the round icon of the card.
          const match = event.title.match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u);
          const icon = match?.[1] ?? "🎂";
          const name = match?.[2] ?? event.title;
          return (
            <li key={event.id} className={days <= 0 ? "dashboard-birthday-chip--today" : undefined}>
              <span className="dashboard-birthday-strip__icon" aria-hidden="true">{icon}</span>
              <span>
                <strong>{name}</strong>
                <small>{when(days, event)}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const DashboardList = ({ list, canWrite, onChanged }: { list: FamilyTaskList; canWrite: boolean; onChanged: () => void }) => {
  // Items ticked here stay visible (ticked) until the page is reloaded, so a wrong tap can be undone.
  const [ticked, setTicked] = useState<Map<string, boolean>>(new Map());
  const isDone = (task: FamilyTaskList["tasks"][number]) => ticked.get(task.id) ?? task.completed;
  const shown = list.tasks.filter((task) => !task.completed || ticked.has(task.id));
  const open = shown.filter((task) => !isDone(task));
  const shopping = isShoppingList(list.name);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const tick = async (taskId: string, completed: boolean) => {
    setTicked((current) => new Map(current).set(taskId, completed));
    try {
      await api.updateTask(list.id, taskId, { completed });
      onChanged();
    } catch {
      setTicked((current) => new Map(current).set(taskId, !completed));
    }
  };

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
    <Card className="panel-card dashboard-side dashboard-list">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Lista · {open.length} da fare</p>
          <h3>
            <span className="dashboard-list__dot" style={{ background: list.color }} aria-hidden="true" />
            {list.name}
          </h3>
        </div>
        <Link to="/lists" className="dashboard-link">Liste →</Link>
      </div>
      {shown.length === 0 ? (
        <p className="dashboard-agenda__empty">✨ Tutto fatto.</p>
      ) : (
        <ul className="dashboard-shopping">
          {shown.map((task) => (
            <li key={task.id} className={isDone(task) ? "dashboard-shopping__done" : undefined}>
              <label>
                <input
                  type="checkbox"
                  checked={isDone(task)}
                  disabled={!canWrite}
                  aria-label={shopping ? `Comprato: ${task.title}` : `Fatto: ${task.title}`}
                  onChange={(change) => void tick(task.id, change.target.checked)}
                />
                <span>{task.title}</span>
              </label>
              {shopping ? <small>{aisleOf(task.title).label}</small> : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <form
          className="dashboard-add"
          onSubmit={(submit) => {
            submit.preventDefault();
            void add();
          }}
        >
          <input value={draft} placeholder="Aggiungi una voce..." aria-label={`Aggiungi a ${list.name}`} onChange={(change) => setDraft(change.target.value)} />
          <Button type="submit" appearance="primary" icon={<AddRegular />} aria-label="Aggiungi" disabled={busy || !draft.trim()} />
        </form>
      ) : null}
    </Card>
  );
};

/** A row of the Oggi card: time, colour bar, title and who; the next event is highlighted. */
const AgendaRow = ({ event, membersById, now, next }: { event: PlannerEvent; membersById: Map<string, User>; now: Date; next: boolean }) => {
  const colors = eventColors(event, membersById);
  const { start, end } = eventBounds(event);
  const people = event.memberIds.map((id) => membersById.get(id)?.displayName).filter(Boolean);
  const detail = [next ? `${start <= now ? "Adesso" : "Prossimo"} · ${relative(start, end, now)}` : "", people.join(", ")].filter(Boolean).join(" · ");
  return (
    <li className={next ? "dashboard-agenda__next" : undefined}>
      <time>{timeOf(start)}</time>
      <span className="dashboard-agenda__bar" style={{ background: colors[0] }} aria-hidden="true" />
      <span className="dashboard-agenda__body">
        <strong>{event.title}</strong>
        {detail ? <span>{detail}</span> : null}
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
