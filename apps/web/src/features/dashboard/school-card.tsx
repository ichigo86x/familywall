import { Card } from "@fluentui/react-components";
import { Link } from "react-router-dom";

import { addDays, eventBounds, occursOnDay } from "@/features/calendar/calendar-time";
import type { PlannerEvent } from "@/features/calendar/calendar-page";

/** School days shown: today and the next week. */
const SCHOOL_DAYS = 7;

const dayLabel = (day: Date, today: Date) => {
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  return days === 0 ? "Oggi" : days === 1 ? "Domani" : day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric" });
};

/** Homework and tests from the school register (ClasseViva), by day; hidden when there is none. */
export const SchoolCard = ({ events, today }: { events: PlannerEvent[]; today: Date }) => {
  const days = Array.from({ length: SCHOOL_DAYS }, (_, index) => addDays(today, index))
    .map((day) => ({ day, items: events.filter((event) => occursOnDay(event, day) && eventBounds(event).end > today) }))
    .filter((entry) => entry.items.length > 0);
  if (events.length === 0) {
    return null;
  }

  return (
    <Card className="panel-card dashboard-school">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Compiti e verifiche</p>
          <h3>Scuola</h3>
        </div>
        <Link to="/calendar" className="dashboard-link">Calendario →</Link>
      </div>
      {days.length === 0 ? (
        <p className="dashboard-empty">
          <span aria-hidden="true">🎒</span>
          Niente compiti né verifiche nei prossimi giorni.
        </p>
      ) : (
        days.map(({ day, items }) => (
          <section key={day.getTime()} className="dashboard-school__day">
            <span className="eyebrow">{dayLabel(day, today)}</span>
            <ul>
              {items.map((event) => (
                <li key={event.id} style={{ borderLeftColor: event.calendarColor }} title={event.notes ?? event.title}>
                  <strong>{event.title}</strong>
                  <span>{event.calendarName.replace(/^Scuola · /, "")}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Card>
  );
};
