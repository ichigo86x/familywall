import ICAL from "ical.js";

export interface RemoteEvent {
  uid: string;
  /** Empty for single events; the occurrence start for instances of a recurring series. */
  occurrenceKey: string;
  title: string;
  /**
   * ISO instants. For all-day events these are UTC midnight of the calendar dates,
   * with endAt exclusive, so clients must read the date part in UTC.
   */
  startAt: string;
  endAt: string;
  allDay: boolean;
}

/** Safety cap for unbounded rules (e.g. a daily event started years ago). */
const MAX_ITERATIONS = 5000;

const toIso = (time: ICAL.Time): string =>
  time.isDate
    ? new Date(Date.UTC(time.year, time.month - 1, time.day)).toISOString()
    : time.toJSDate().toISOString();

const defaultEnd = (start: ICAL.Time): ICAL.Time => {
  const end = start.clone();
  end.addDuration(ICAL.Duration.fromData(start.isDate ? { days: 1 } : { hours: 1 }));
  return end;
};

const overlaps = (start: ICAL.Time, end: ICAL.Time, from: Date, to: Date): boolean =>
  new Date(toIso(start)) < to && new Date(toIso(end)) > from;

/**
 * Parses one CalDAV calendar resource and expands recurring events
 * (RRULE, EXDATE, RECURRENCE-ID overrides) into the [from, to) range.
 */
export const parseCalendarData = (ics: string, from: Date, to: Date): RemoteEvent[] => {
  const root = new ICAL.Component(ICAL.parse(ics));

  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(vtimezone);
  }

  const vevents = root.getAllSubcomponents("vevent");
  const exceptions = vevents.filter((component) => component.hasProperty("recurrence-id"));
  const masters = vevents.filter((component) => !component.hasProperty("recurrence-id"));
  const masterUids = new Set(masters.map((component) => String(component.getFirstPropertyValue("uid") ?? "")));
  const events: RemoteEvent[] = [];

  for (const component of masters) {
    const event = new ICAL.Event(component, { exceptions, strictExceptions: true });
    if (!event.startDate) {
      continue;
    }

    const title = event.summary || "Evento";

    if (!event.isRecurring()) {
      const end = event.endDate ?? defaultEnd(event.startDate);
      if (overlaps(event.startDate, end, from, to)) {
        events.push({ uid: event.uid, occurrenceKey: "", title, startAt: toIso(event.startDate), endAt: toIso(end), allDay: event.startDate.isDate });
      }
      continue;
    }

    const iterator = event.iterator();
    for (let index = 0, next = iterator.next(); next && index < MAX_ITERATIONS; index += 1, next = iterator.next()) {
      const details = event.getOccurrenceDetails(next);
      if (new Date(toIso(details.startDate)) >= to) {
        break;
      }

      if (!overlaps(details.startDate, details.endDate, from, to)) {
        continue;
      }

      events.push({
        uid: event.uid,
        occurrenceKey: toIso(next),
        title: details.item.summary || title,
        startAt: toIso(details.startDate),
        endAt: toIso(details.endDate),
        allDay: details.startDate.isDate
      });
    }
  }

  // An override can arrive without its master when the series started outside the queried range.
  for (const component of exceptions) {
    const event = new ICAL.Event(component);
    if (masterUids.has(event.uid) || !event.startDate) {
      continue;
    }

    const end = event.endDate ?? defaultEnd(event.startDate);
    if (overlaps(event.startDate, end, from, to)) {
      events.push({
        uid: event.uid,
        occurrenceKey: event.recurrenceId ? toIso(event.recurrenceId) : "",
        title: event.summary || "Evento",
        startAt: toIso(event.startDate),
        endAt: toIso(end),
        allDay: event.startDate.isDate
      });
    }
  }

  return events;
};
