import { Button, Card, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface } from "@fluentui/react-components";
import type { FamilyCalendar, FamilyEvent } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { addDays, occursOnDay, startOfDay } from "@/features/calendar/calendar-time";
import { DismissRegular } from "@/lib/fluent-icons";

/** An item of a school register (homework, test, note) with the colour and name of its calendar (one per child). */
export interface SchoolItem extends FamilyEvent {
  color: string;
  child: string;
}

const flatten = (calendars: FamilyCalendar[]): SchoolItem[] =>
  calendars
    .flatMap((calendar) => calendar.events.map((event) => ({ ...event, color: calendar.color, child: calendar.name.replace(/^Scuola · /, "") })))
    .sort((left, right) => left.startAt.localeCompare(right.startAt));

/** Homework and tests between two days (ClasseViva), kept in memory like the other pages. */
export const useSchool = (from: Date, to: Date) => {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const school = useAsyncResource(() => api.getSchool(fromIso, toIso).catch(() => null), [fromIso, toIso], `school:${fromIso}:${toIso}`);
  const calendars = school.data?.calendars ?? [];
  return {
    available: calendars.length > 0,
    items: flatten(calendars),
    errors: calendars.filter((calendar) => calendar.lastError).map((calendar) => `${calendar.name}: ${calendar.lastError}`),
    reload: school.reload
  };
};

/** Whether the family has a school register: the header shows the Scuola button only then. */
export const useHasSchool = (): boolean => {
  const today = startOfDay(new Date());
  return useSchool(today, addDays(today, 7)).available;
};

const SchoolList = ({ items }: { items: SchoolItem[] }) => (
  <ul className="school-items">
    {items.map((item) => (
      <li key={item.id} style={{ borderLeftColor: item.color }}>
        <strong>{item.title}</strong>
        {/* The title has the first line of the text: longer texts are shown in full. */}
        {item.notes?.includes("\n") ? <p>{item.notes}</p> : null}
        <span>{item.child}</span>
      </li>
    ))}
  </ul>
);

/** The school items of one day (Calendar: the backpack icon on the day). */
export const SchoolDayDialog = ({ day, items, onClose }: { day: Date; items: SchoolItem[]; onClose: () => void }) => (
  <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
    <DialogSurface className="event-dialog">
      <DialogBody>
        <CloseableDialogTitle>Scuola · {day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</CloseableDialogTitle>
        <DialogContent className="dialog-form">
          <SchoolList items={items.filter((item) => occursOnDay(item, day))} />
        </DialogContent>
        <DialogActions>
          <Button appearance="primary" onClick={onClose}>Chiudi</Button>
        </DialogActions>
      </DialogBody>
    </DialogSurface>
  </Dialog>
);

const dayLabel = (day: Date, today: Date) => {
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  return days === 0 ? "Oggi" : days === 1 ? "Domani" : day.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" });
};

/** Dashboard: homework and tests of the next seven days, by day, in place of the household cards. */
export const SchoolPanel = ({ today, onClose }: { today: Date; onClose: () => void }) => {
  const school = useSchool(today, addDays(today, 7));
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index));

  return (
    <Card className="panel-card school-panel">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Compiti e verifiche</p>
          <h3>Scuola · prossimi giorni</h3>
        </div>
        <Button appearance="subtle" icon={<DismissRegular />} aria-label="Chiudi la scuola" onClick={onClose} />
      </div>
      {school.errors.map((error) => (
        <p key={error} className="form-error">{error}</p>
      ))}
      <ul className="dashboard-days school-days">
        {days.map((day) => {
          const items = school.items.filter((item) => occursOnDay(item, day));
          return (
            <li key={day.getTime()}>
              <span className="dashboard-days__label">
                <strong>{dayLabel(day, today)}</strong>
                <span>{day.getDate()}</span>
              </span>
              {items.length === 0 ? <span className="dashboard-days__free">Niente</span> : <SchoolList items={items} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
