import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  MessageBar,
  MessageBarBody
} from "@fluentui/react-components";
import type { FamilyEvent, User } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/page-states";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { ArrowLeftRegular, ArrowRightRegular, CalendarRegular } from "@/lib/fluent-icons";
import { EventEditor, type CalendarOption } from "./event-editor";
import { addDays, dayKey, eventBounds, occursOnDay, plannerDays, plannerTitle, timeLabel, type PlannerMode } from "./calendar-time";

/** Wall panels stay open for days: refresh periodically so provider changes show up. */
const AUTO_REFRESH_MS = 5 * 60 * 1000;

export interface PlannerEvent extends FamilyEvent {
  calendarColor: string;
  calendarName: string;
}

/**
 * Colors of an event: the main tag wins, otherwise one color per involved member
 * (assigned in the app or recognised in the title), otherwise the calendar color.
 */
export const eventColors = (event: PlannerEvent, membersById: Map<string, User>): string[] => {
  const tagColor = event.tagMemberId ? membersById.get(event.tagMemberId)?.color : undefined;
  if (tagColor) {
    return [tagColor];
  }
  const memberColors = [...new Set(event.memberIds.map((id) => membersById.get(id)?.color).filter((color): color is string => Boolean(color)))];
  return memberColors.length > 0 ? memberColors : [event.calendarColor];
};

/** Single member: tinted card. Several members: soft gradient across all their colors. */
export const eventBackground = (colors: string[]): string =>
  colors.length === 1 ? `${colors[0]}22` : `linear-gradient(90deg, ${colors.map((color) => `${color}2E`).join(", ")})`;

/** Chef hat (no Fluent equivalent); takes the current text color. */
const ChefHatIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M7 14.5c-2.5-.4-4-2.3-4-4.4C3 7.6 5 5.7 7.4 5.9 8.2 4 10 2.8 12 2.8s3.8 1.2 4.6 3.1c2.4-.2 4.4 1.7 4.4 4.2 0 2.1-1.5 4-4 4.4V20H7z" fill="currentColor" fillOpacity="0.22" />
    <path d="M7 17h10" />
  </svg>
);

export const CalendarPage = () => {
  const auth = useAuth();
  const canWrite = auth.can("events:write");
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("biweek");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const days = useMemo(() => plannerDays(plannerMode, anchorDate), [plannerMode, anchorDate]);
  const rangeFrom = days[0]!.toISOString();
  const rangeTo = addDays(days[days.length - 1]!, 1).toISOString();

  const calendar = useAsyncResource(() => api.getCalendar(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const members = useAsyncResource(() => api.getMembers(), []);

  // Phones show days in one column: start from today instead of the past days above it.
  const hasData = Boolean(calendar.data);
  useEffect(() => {
    if (hasData && window.matchMedia("(max-width: 700px)").matches) {
      document.querySelector(".planner-day--today")?.scrollIntoView({ block: "start" });
    }
  }, [hasData, plannerMode]);

  useEffect(() => {
    const timer = window.setInterval(calendar.reload, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [calendar.reload]);

  const memberList = useMemo(() => (members.data ?? []).filter((member) => member.role !== "Kiosk" && !member.disabled), [members.data]);
  const membersById = useMemo(() => new Map((members.data ?? []).map((member) => [member.id, member])), [members.data]);
  const calendars = calendar.data?.calendars ?? [];
  // Read-only calendars (e.g. the Cookidoo meal plan) cannot receive new events.
  const calendarOptions: CalendarOption[] = calendars.filter((entry) => !entry.readOnly).map((entry) => ({ id: entry.id, name: entry.name }));
  const readOnlyCalendarIds = useMemo(() => new Set(calendars.filter((entry) => entry.readOnly).map((entry) => entry.id)), [calendars]);

  const toPlannerEvents = (kind: "events" | "meals") =>
    calendars
      .filter((entry) => (entry.kind ?? "events") === kind)
      .flatMap((entry) => entry.events.map((event) => ({ ...event, calendarColor: entry.color, calendarName: entry.name })));
  // Meal plans (Cookidoo) are not drawn as events: a chef hat on the day opens them.
  const meals = useMemo<PlannerEvent[]>(() => toPlannerEvents("meals"), [calendars]);
  const [mealsDay, setMealsDay] = useState<Date | null>(null);
  const events = useMemo<PlannerEvent[]>(
    () =>
      calendars
        .filter((entry) => (entry.kind ?? "events") === "events")
        .flatMap((entry) => entry.events.map((event) => ({ ...event, calendarColor: entry.color, calendarName: entry.name })))
        .sort((left, right) => Number(right.allDay) - Number(left.allDay) || left.startAt.localeCompare(right.startAt)),
    [calendars]
  );
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const failingCalendars = calendars.filter((entry) => entry.lastError);
  const dialogOpen = creating || selectedEvent !== null;

  const shiftPlanner = (direction: -1 | 1) => {
    setAnchorDate((current) =>
      plannerMode === "month"
        ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
        : addDays(current, direction * (plannerMode === "week" ? 7 : 14))
    );
  };

  const closeDialog = () => {
    setSelectedEventId(null);
    setCreating(false);
  };

  const afterSave = () => {
    closeDialog();
    calendar.reload();
  };

  return (
    <AppShell
      compact
      fit
      currentRoute="/calendar"
      eyebrow="Calendario"
      title={plannerTitle(plannerMode, anchorDate)}
      subtitle=""
      summaryChip={`${events.length} eventi`}
      toolbarActions={
        <div className="calendar-toolbar">
          <div className="calendar-toolbar__group">
            <Button appearance="secondary" icon={<ArrowLeftRegular />} aria-label="Indietro" onClick={() => shiftPlanner(-1)} />
            <Button appearance="secondary" onClick={() => setAnchorDate(new Date())}>Oggi</Button>
            <Button appearance="secondary" icon={<ArrowRightRegular />} aria-label="Avanti" onClick={() => shiftPlanner(1)} />
          </div>
          <div className="calendar-toolbar__group">
            <Button appearance={plannerMode === "week" ? "primary" : "secondary"} onClick={() => setPlannerMode("week")}>7 giorni</Button>
            <Button appearance={plannerMode === "biweek" ? "primary" : "secondary"} onClick={() => setPlannerMode("biweek")}>14 giorni</Button>
            <Button appearance={plannerMode === "month" ? "primary" : "secondary"} onClick={() => setPlannerMode("month")}>Mese</Button>
          </div>
          {canWrite ? (
            <Button
              appearance="primary"
              icon={<CalendarRegular />}
              onClick={() => {
                setSelectedEventId(null);
                setCreating(true);
              }}
              disabled={calendarOptions.length === 0}
            >
              Nuovo evento
            </Button>
          ) : null}
        </div>
      }
    >
      {calendar.status === "loading" && !calendar.data ? (
        <LoadingState title="Caricamento calendario" message="Lettura degli eventi dai calendari collegati." />
      ) : calendar.status === "error" ? (
        <ErrorState title="Calendario non disponibile" message={calendar.error.message} actionLabel="Riprova" onAction={calendar.reload} />
      ) : calendars.length === 0 ? (
        <EmptyState
          title="Nessun calendario collegato"
          message={auth.can("providers:manage") ? "Collega un account iCloud dalla sezione Admin." : "Chiedi all'amministratore di collegare un calendario."}
          actionLabel="Ricarica"
          onAction={calendar.reload}
        />
      ) : (
        <Card className="panel-card calendar-planner-card">
          {failingCalendars.map((entry) => (
            <MessageBar key={entry.id} intent="warning">
              <MessageBarBody>
                <strong>{entry.name}:</strong> {entry.lastError}
              </MessageBarBody>
            </MessageBar>
          ))}

          <div className="calendar-legend">
            {memberList.map((member) => (
              <span key={member.id} className="legend-chip">
                <span className="legend-chip__swatch" style={{ background: member.color }} />
                {member.displayName}
              </span>
            ))}
            <span className="legend-chip__separator" aria-hidden="true" />
            {calendars.map((entry) => (
              <span key={entry.id} className="legend-chip legend-chip--calendar">
                <span className="legend-chip__swatch legend-chip__swatch--square" style={{ background: entry.color }} />
                {entry.name}
              </span>
            ))}
          </div>

          <div className={`planner-grid planner-grid--${plannerMode}`}>
            {days.map((day) => {
              const dayEvents = events.filter((event) => occursOnDay(event, day));
              const dayMeals = meals.filter((meal) => occursOnDay(meal, day));
              const mealColor = dayMeals[0]?.calendarColor;
              const isMuted = plannerMode === "month" && day.getMonth() !== anchorDate.getMonth();
              const todayKey = dayKey(new Date());
              const isToday = dayKey(day) === todayKey;
              // Past days and finished events fade out; today stands out.
              const isPast = dayKey(day) < todayKey;
              return (
                <div key={dayKey(day)} className={["planner-day", isMuted ? "planner-day--muted" : "", isToday ? "planner-day--today" : "", isPast ? "planner-day--past" : ""].join(" ").trim()}>
                  <div className="planner-day__header">
                    <span className="planner-day__title">
                      <strong>
                        {/* Long names on wide screens, short ones on tablets and in the month view. */}
                        <span className={plannerMode === "month" ? "weekday-short" : "weekday-long"}>
                          {day.toLocaleDateString("it-IT", { weekday: plannerMode === "month" ? "short" : "long" })}
                        </span>
                        {plannerMode === "month" ? null : <span className="weekday-short">{day.toLocaleDateString("it-IT", { weekday: "short" })}</span>}
                      </strong>
                      {mealColor ? (
                        <button
                          type="button"
                          className="meal-button"
                          style={{ color: mealColor, borderColor: `${mealColor}66`, background: `${mealColor}14` }}
                          onClick={() => setMealsDay(day)}
                          aria-label={`Pasti di ${day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}`}
                          title={dayMeals.map((meal) => meal.title).join(", ")}
                        >
                          <ChefHatIcon />
                        </button>
                      ) : null}
                    </span>
                    {isToday ? <span className="today-pill">Oggi</span> : <span>{day.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>}
                  </div>
                  <div className="planner-day__events">
                    {dayEvents.map((event) => {
                      const colors = eventColors(event, membersById);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          className={["planner-event", selectedEventId === event.id ? "planner-event--selected" : "", isToday && eventBounds(event).end.getTime() <= Date.now() ? "planner-event--past" : ""].join(" ").trim()}
                          onClick={() => {
                            setCreating(false);
                            setSelectedEventId(event.id);
                          }}
                          style={{ background: eventBackground(colors) }}
                          title={event.title}
                        >
                          <span className="planner-event__bar" aria-hidden="true">
                            {colors.map((color) => (
                              <span key={color} style={{ background: color }} />
                            ))}
                          </span>
                          {/* All-day events sit at the top of the day with just their title. */}
                          {event.allDay ? null : <span className="planner-event__time">{timeLabel(event)}</span>}
                          <strong>{event.title}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Dialog open={mealsDay !== null} onOpenChange={(_, data) => (!data.open ? setMealsDay(null) : undefined)}>
        <DialogSurface className="event-dialog meals-dialog">
          <DialogBody>
            <CloseableDialogTitle>
              Pasti di {mealsDay?.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            </CloseableDialogTitle>
            <DialogContent>
              {mealsDay ? (
                <ul className="meal-list">
                  {meals
                    .filter((meal) => occursOnDay(meal, mealsDay))
                    .map((meal) => (
                      <li key={meal.id} className="meal-list__item" style={{ borderColor: meal.calendarColor }}>
                        <span className="meal-list__icon" style={{ color: meal.calendarColor }}>
                          <ChefHatIcon />
                        </span>
                        <span>
                          <strong>{meal.title}</strong>
                          <span className="calendar-detail-hint">{meal.calendarName}</span>
                        </span>
                      </li>
                    ))}
                </ul>
              ) : null}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={(_, data) => (!data.open ? closeDialog() : undefined)}>
        <DialogSurface className="event-dialog">
          <DialogBody>
            <CloseableDialogTitle>
              {creating ? "Nuovo evento" : selectedEvent?.title}
            </CloseableDialogTitle>
            <DialogContent>
              {dialogOpen ? (
                <EventEditor
                  key={creating ? "new" : selectedEvent!.id}
                  event={creating ? null : selectedEvent}
                  calendars={calendarOptions}
                  members={memberList}
                  membersById={membersById}
                  readOnly={!canWrite || (selectedEvent !== null && readOnlyCalendarIds.has(selectedEvent.calendarId))}
                  onSaved={afterSave}
                />
              ) : null}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </AppShell>
  );
};
