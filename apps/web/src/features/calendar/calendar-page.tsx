import { useEffect, useMemo, useState } from "react";
import { Button, Card, MessageBar, MessageBarBody } from "@fluentui/react-components";
import type { FamilyEvent, User } from "@familywall/shared";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/page-states";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { CalendarRegular, EyeRegular } from "@/lib/fluent-icons";
import { EventEditor, type CalendarOption } from "./event-editor";
import { addDays, dayKey, occursOnDay, plannerDays, plannerTitle, timeLabel, type PlannerMode } from "./calendar-time";

/** Wall panels stay open for days: refresh periodically so provider changes show up. */
const AUTO_REFRESH_MS = 5 * 60 * 1000;

export interface PlannerEvent extends FamilyEvent {
  calendarColor: string;
  calendarName: string;
}

const eventColors = (event: PlannerEvent, membersById: Map<string, User>): string[] => {
  const tagColor = event.tagMemberId ? membersById.get(event.tagMemberId)?.color : undefined;
  if (tagColor) {
    return [tagColor];
  }
  const memberColors = [...new Set(event.memberIds.map((id) => membersById.get(id)?.color).filter((color): color is string => Boolean(color)))];
  return memberColors.length > 0 ? memberColors : [event.calendarColor];
};

const eventAccent = (event: PlannerEvent, membersById: Map<string, User>) => {
  const colors = eventColors(event, membersById);
  if (colors.length === 1) {
    return { background: `${colors[0]}22`, borderColor: colors[0] };
  }
  return {
    background: `linear-gradient(135deg, ${colors.slice(0, 3).map((color, index) => `${color}${index === 0 ? "33" : "22"}`).join(", ")})`,
    borderColor: colors[0]
  };
};

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

  const shiftPlanner = (direction: -1 | 1) => {
    setAnchorDate((current) =>
      plannerMode === "month"
        ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
        : addDays(current, direction * (plannerMode === "week" ? 7 : 14))
    );
  };

  const startNewEvent = () => {
    setSelectedEventId(null);
    setCreating(true);
  };

  const afterSave = (savedId: string | null) => {
    setCreating(false);
    setSelectedEventId(savedId);
    calendar.reload();
  };

  return (
    <AppShell
      currentRoute="/calendar"
      eyebrow="Calendario"
      title="Planner famiglia"
      subtitle="Vista settimanale, bisettimanale o mensile. I colori seguono il membro coinvolto o il tag principale."
      summaryChip={`${events.length} eventi`}
      toolbarActions={
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <Button appearance={plannerMode === "week" ? "primary" : "secondary"} onClick={() => setPlannerMode("week")}>7 giorni</Button>
          <Button appearance={plannerMode === "biweek" ? "primary" : "secondary"} onClick={() => setPlannerMode("biweek")}>14 giorni</Button>
          <Button appearance={plannerMode === "month" ? "primary" : "secondary"} onClick={() => setPlannerMode("month")}>Mese</Button>
          {canWrite ? (
            <Button appearance="primary" icon={<CalendarRegular />} onClick={startNewEvent} disabled={calendars.length === 0}>
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
        <section className="content-grid content-grid--wide calendar-planner-layout">
          <Card className="panel-card calendar-planner-card">
            <div className="panel-card__header">
              <div>
                <p className="eyebrow">Planner</p>
                <h3>{plannerTitle(plannerMode, anchorDate)}</h3>
              </div>
              <div className="calendar-planner-toolbar">
                <Button appearance="secondary" onClick={() => shiftPlanner(-1)}>Indietro</Button>
                <Button appearance="secondary" onClick={() => setAnchorDate(new Date())}>Oggi</Button>
                <Button appearance="secondary" onClick={() => shiftPlanner(1)}>Avanti</Button>
              </div>
            </div>

            {failingCalendars.map((entry) => (
              <MessageBar key={entry.id} intent="warning">
                <MessageBarBody>
                  <strong>{entry.name}:</strong> {entry.lastError}
                </MessageBarBody>
              </MessageBar>
            ))}

            <div className="calendar-legend-grid">
              {calendars.map((entry) => (
                <div key={entry.id} className="calendar-legend-item">
                  <span className="calendar-legend-swatch" style={{ background: entry.color }} />
                  <div>
                    <strong>{entry.name}</strong>
                    <p>{entry.events.length} eventi</p>
                  </div>
                </div>
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
                      {dayEvents.length === 0 ? <p className="planner-day__empty">Nessun evento</p> : null}
                      {dayEvents.map((event) => {
                        const accent = eventAccent(event, membersById);
                        return (
                          <button
                            key={event.id}
                            type="button"
                            className={`planner-event ${selectedEventId === event.id ? "planner-event--selected" : ""}`.trim()}
                            onClick={() => {
                              setCreating(false);
                              setSelectedEventId(event.id);
                            }}
                            style={{ background: accent.background, borderColor: accent.borderColor }}
                          >
                            <span className="planner-event__time">{timeLabel(event)}</span>
                            <strong>{event.title}</strong>
                            <span>
                              {(event.tagMemberId ? [event.tagMemberId] : event.memberIds)
                                .map((id) => membersById.get(id)?.displayName)
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="panel-card calendar-detail-card">
            <div className="panel-card__header">
              <div>
                <p className="eyebrow">Dettaglio evento</p>
                <h3>{creating ? "Nuovo evento" : selectedEvent ? selectedEvent.title : "Nessun evento selezionato"}</h3>
              </div>
              {selectedEvent || creating ? (
                <Button
                  appearance="subtle"
                  icon={<EyeRegular />}
                  onClick={() => {
                    setSelectedEventId(null);
                    setCreating(false);
                  }}
                >
                  Chiudi
                </Button>
              ) : null}
            </div>

            {creating || selectedEvent ? (
              <EventEditor
                key={creating ? "new" : selectedEvent!.id}
                event={creating ? null : selectedEvent}
                calendars={calendarOptions}
                members={memberList}
                membersById={membersById}
                readOnly={!canWrite}
                onSaved={afterSave}
              />
            ) : (
              <EmptyState
                title="Seleziona un evento"
                message={canWrite ? "Apri un evento dal planner per vedere il dettaglio, oppure creane uno nuovo." : "Apri un evento dal planner per vedere il dettaglio."}
                actionLabel={canWrite ? "Nuovo evento" : undefined}
                onAction={canWrite ? startNewEvent : undefined}
              />
            )}
          </Card>
        </section>
      )}
    </AppShell>
  );
};
