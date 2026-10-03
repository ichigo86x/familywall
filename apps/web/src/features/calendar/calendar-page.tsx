import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  MessageBar,
  MessageBarBody
} from "@fluentui/react-components";
import type { FamilyEvent, User } from "@familywall/shared";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/page-states";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { ArrowLeftRegular, ArrowRightRegular, CalendarRegular, DismissRegular } from "@/lib/fluent-icons";
import { EventEditor, type CalendarOption } from "./event-editor";
import { addDays, dayKey, occursOnDay, plannerDays, plannerTitle, timeLabel, type PlannerMode } from "./calendar-time";

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
const eventColors = (event: PlannerEvent, membersById: Map<string, User>): string[] => {
  const tagColor = event.tagMemberId ? membersById.get(event.tagMemberId)?.color : undefined;
  if (tagColor) {
    return [tagColor];
  }
  const memberColors = [...new Set(event.memberIds.map((id) => membersById.get(id)?.color).filter((color): color is string => Boolean(color)))];
  return memberColors.length > 0 ? memberColors : [event.calendarColor];
};

/** Single member: tinted card. Several members: soft gradient across all their colors. */
const eventBackground = (colors: string[]): string =>
  colors.length === 1 ? `${colors[0]}22` : `linear-gradient(90deg, ${colors.map((color) => `${color}2E`).join(", ")})`;

export const CalendarPage = () => {
  const auth = useAuth();
  const canWrite = auth.can("events:write");
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const days = useMemo(() => plannerDays(plannerMode, anchorDate), [plannerMode, anchorDate]);
  const rangeFrom = days[0]!.toISOString();
  const rangeTo = addDays(days[days.length - 1]!, 1).toISOString();

  const calendar = useAsyncResource(() => api.getCalendar(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const members = useAsyncResource(() => api.getMembers(), []);

  useEffect(() => {
    const timer = window.setInterval(calendar.reload, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [calendar.reload]);

  const memberList = useMemo(() => (members.data ?? []).filter((member) => member.role !== "Kiosk" && !member.disabled), [members.data]);
  const membersById = useMemo(() => new Map((members.data ?? []).map((member) => [member.id, member])), [members.data]);
  const calendars = calendar.data?.calendars ?? [];
  const calendarOptions: CalendarOption[] = calendars.map((entry) => ({ id: entry.id, name: entry.name }));

  const events = useMemo<PlannerEvent[]>(
    () =>
      calendars
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
              disabled={calendars.length === 0}
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
              const isMuted = plannerMode === "month" && day.getMonth() !== anchorDate.getMonth();
              const isToday = dayKey(day) === dayKey(new Date());
              return (
                <div key={dayKey(day)} className={["planner-day", isMuted ? "planner-day--muted" : "", isToday ? "planner-day--today" : ""].join(" ").trim()}>
                  <div className="planner-day__header">
                    <strong>{day.toLocaleDateString("it-IT", { weekday: plannerMode === "month" ? "short" : "long" })}</strong>
                    <span>{day.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>
                  </div>
                  <div className="planner-day__events">
                    {dayEvents.map((event) => {
                      const colors = eventColors(event, membersById);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          className={`planner-event ${selectedEventId === event.id ? "planner-event--selected" : ""}`.trim()}
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
                          <span className="planner-event__time">{timeLabel(event)}</span>
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

      <Dialog open={dialogOpen} onOpenChange={(_, data) => (!data.open ? closeDialog() : undefined)}>
        <DialogSurface className="event-dialog">
          <DialogBody>
            <DialogTitle
              action={
                <DialogTrigger action="close">
                  <Button appearance="subtle" aria-label="Chiudi" icon={<DismissRegular />} />
                </DialogTrigger>
              }
            >
              {creating ? "Nuovo evento" : selectedEvent?.title}
            </DialogTitle>
            <DialogContent>
              {dialogOpen ? (
                <EventEditor
                  key={creating ? "new" : selectedEvent!.id}
                  event={creating ? null : selectedEvent}
                  calendars={calendarOptions}
                  members={memberList}
                  membersById={membersById}
                  readOnly={!canWrite}
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
