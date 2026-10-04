import { randomUUID } from "node:crypto";
import ICAL from "ical.js";
import type { RecurrenceRule } from "@familywall/shared";
import { buildVTimezone, zoneOffsetMinutes } from "./vtimezone";

export type RecurrenceScope = "occurrence" | "series";

export interface EventTimes {
  /** ISO instants; all-day values are UTC midnight of the dates with an exclusive end. */
  startAt: string;
  endAt: string;
  allDay: boolean;
}

export interface EventEdit extends Partial<EventTimes> {
  title?: string;
}

const PRODID = "-//Familywall//Familywall//IT";

export const newEventUid = (): string => `${randomUUID()}@familywall`;

/** Converts an API instant to an ICAL.Time, keeping the zone of the event being edited when there is one. */
const toIcalTime = (iso: string, allDay: boolean, zone?: ICAL.Timezone): ICAL.Time => {
  const date = new Date(iso);
  if (allDay) {
    return ICAL.Time.fromData({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), isDate: true });
  }

  const utc = ICAL.Time.fromJSDate(date, true);
  const keepZone = zone && zone !== ICAL.Timezone.utcTimezone && zone !== ICAL.Timezone.localTimezone;
  return keepZone ? utc.convertToZone(zone) : utc;
};

/** Same convention as the parser: all-day times become UTC midnight. */
const toIso = (time: ICAL.Time): string =>
  time.isDate ? new Date(Date.UTC(time.year, time.month - 1, time.day)).toISOString() : time.toJSDate().toISOString();

const touch = (component: ICAL.Component): void => {
  const now = ICAL.Time.fromJSDate(new Date(), true);
  component.updatePropertyWithValue("dtstamp", now);
  component.updatePropertyWithValue("last-modified", now);
  const sequence = Number(component.getFirstPropertyValue("sequence") ?? 0);
  component.updatePropertyWithValue("sequence", sequence + 1);
};

const setTimes = (event: ICAL.Event, times: EventTimes, zone?: ICAL.Timezone): void => {
  // DTEND and DURATION are mutually exclusive; always write DTEND.
  event.component.removeAllProperties("duration");
  event.startDate = toIcalTime(times.startAt, times.allDay, zone);
  event.endDate = toIcalTime(times.endAt, times.allDay, zone);
};

const parse = (ics: string) => {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(vtimezone);
  }
  return root;
};

const findMaster = (root: ICAL.Component, uid: string): ICAL.Component | undefined =>
  root.getAllSubcomponents("vevent").find((component) => component.getFirstPropertyValue("uid") === uid && !component.hasProperty("recurrence-id"));

const findException = (root: ICAL.Component, uid: string, occurrenceKey: string): ICAL.Component | undefined =>
  root.getAllSubcomponents("vevent").find((component) => {
    const recurrenceId = component.getFirstPropertyValue("recurrence-id");
    return component.getFirstPropertyValue("uid") === uid && recurrenceId instanceof ICAL.Time && toIso(recurrenceId) === occurrenceKey;
  });

/** Original start of an occurrence, typed like the master DTSTART so servers match it. */
const occurrenceTime = (master: ICAL.Event, occurrenceKey: string): ICAL.Time =>
  toIcalTime(occurrenceKey, master.startDate.isDate, master.startDate.zone);

export interface NewEventRecurrence {
  rule: RecurrenceRule;
  /** IANA zone of the household: a weekly 18:00 stays 18:00 across daylight saving changes. */
  timeZone: string;
}

/** Wall-clock time of an instant in the given zone, attached to the matching VTIMEZONE. */
const wallTime = (iso: string, timeZone: string, zone: ICAL.Timezone): ICAL.Time => {
  const instant = new Date(iso);
  const local = new Date(instant.getTime() + zoneOffsetMinutes(timeZone, instant) * 60_000);
  return ICAL.Time.fromData(
    {
      year: local.getUTCFullYear(),
      month: local.getUTCMonth() + 1,
      day: local.getUTCDate(),
      hour: local.getUTCHours(),
      minute: local.getUTCMinutes(),
      second: local.getUTCSeconds()
    },
    zone
  );
};

const compact = (date: Date): string => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/** RRULE text; UNTIL covers the whole chosen day (DATE for all-day events, UTC end of the local day otherwise). */
export const rruleText = (rule: RecurrenceRule, allDay: boolean, timeZone: string): string => {
  const parts = [`FREQ=${rule.frequency.toUpperCase()}`, `INTERVAL=${rule.interval}`];
  if (rule.frequency === "weekly" && rule.weekdays.length > 0) {
    parts.push(`BYDAY=${rule.weekdays.join(",")}`);
  }
  if (rule.count) {
    parts.push(`COUNT=${rule.count}`);
  } else if (rule.until) {
    if (allDay) {
      parts.push(`UNTIL=${rule.until.replace(/-/g, "")}`);
    } else {
      const [year, month, day] = rule.until.split("-").map(Number) as [number, number, number];
      const wallEnd = Date.UTC(year, month - 1, day, 23, 59, 59);
      const offset = zoneOffsetMinutes(timeZone, new Date(wallEnd - zoneOffsetMinutes(timeZone, new Date(wallEnd)) * 60_000));
      parts.push(`UNTIL=${compact(new Date(wallEnd - offset * 60_000))}`);
    }
  }
  return parts.join(";");
};

export const buildEventIcs = (uid: string, title: string, times: EventTimes, recurrence?: NewEventRecurrence): string => {
  const root = new ICAL.Component("vcalendar");
  root.updatePropertyWithValue("version", "2.0");
  root.updatePropertyWithValue("prodid", PRODID);

  const vevent = new ICAL.Component("vevent");
  const event = new ICAL.Event(vevent);
  event.uid = uid;
  event.summary = title;
  if (recurrence && !times.allDay) {
    const vtimezone = buildVTimezone(recurrence.timeZone);
    root.addSubcomponent(vtimezone);
    const zone = new ICAL.Timezone({ component: vtimezone, tzid: recurrence.timeZone });
    event.startDate = wallTime(times.startAt, recurrence.timeZone, zone);
    event.endDate = wallTime(times.endAt, recurrence.timeZone, zone);
  } else {
    setTimes(event, times);
  }
  if (recurrence) {
    vevent.updatePropertyWithValue("rrule", ICAL.Recur.fromString(rruleText(recurrence.rule, times.allDay, recurrence.timeZone)));
  }
  vevent.updatePropertyWithValue("created", ICAL.Time.fromJSDate(new Date(), true));
  touch(vevent);
  root.addSubcomponent(vevent);
  return root.toString();
};

/**
 * Applies an edit to a CalDAV resource.
 * - Single events: the VEVENT is updated in place.
 * - scope "series": the master changes; a new start shifts the whole series by the same offset.
 * - scope "occurrence": an override VEVENT with RECURRENCE-ID is created or updated.
 */
export const applyEventEdit = (ics: string, uid: string, occurrenceKey: string, scope: RecurrenceScope, edit: EventEdit): string => {
  const root = parse(ics);
  const masterComponent = findMaster(root, uid);
  const existingException = occurrenceKey ? findException(root, uid, occurrenceKey) : undefined;

  if (!masterComponent) {
    // Only an override is stored here (series owned elsewhere): edit it as a single event.
    if (!existingException) {
      throw new Error("Evento non trovato nella risorsa del calendario.");
    }
    editInPlace(new ICAL.Event(existingException), edit);
    return root.toString();
  }

  const master = new ICAL.Event(masterComponent);

  if (!master.isRecurring() || scope === "series") {
    if (master.isRecurring() && occurrenceKey && (edit.startAt || edit.endAt)) {
      shiftSeries(master, occurrenceKey, edit);
      if (edit.title !== undefined) {
        master.summary = edit.title;
      }
      touch(masterComponent);
    } else {
      editInPlace(master, edit);
    }
    return root.toString();
  }

  if (!occurrenceKey) {
    throw new Error("Occorrenza non specificata.");
  }

  if (existingException) {
    editInPlace(new ICAL.Event(existingException), edit);
    return root.toString();
  }

  // New override: start from the occurrence as it is today, then apply the edit.
  const original = master.getOccurrenceDetails(occurrenceTime(master, occurrenceKey));
  const override = new ICAL.Component("vevent");
  for (const property of masterComponent.getAllProperties()) {
    if (!["rrule", "rdate", "exdate", "dtstart", "dtend", "duration", "sequence"].includes(property.name)) {
      override.addProperty(ICAL.Property.fromString(property.toICALString()));
    }
  }
  const overrideEvent = new ICAL.Event(override);
  overrideEvent.recurrenceId = occurrenceTime(master, occurrenceKey);
  setTimes(
    overrideEvent,
    {
      startAt: edit.startAt ?? toIso(original.startDate),
      endAt: edit.endAt ?? toIso(original.endDate),
      allDay: edit.allDay ?? original.startDate.isDate
    },
    master.startDate.zone
  );
  if (edit.title !== undefined) {
    overrideEvent.summary = edit.title;
  }
  touch(override);
  root.addSubcomponent(override);
  return root.toString();
};

const editInPlace = (event: ICAL.Event, edit: EventEdit): void => {
  if (edit.title !== undefined) {
    event.summary = edit.title;
  }
  if (edit.startAt || edit.endAt || edit.allDay !== undefined) {
    setTimes(
      event,
      {
        startAt: edit.startAt ?? toIso(event.startDate),
        endAt: edit.endAt ?? toIso(event.endDate),
        allDay: edit.allDay ?? event.startDate.isDate
      },
      event.startDate.zone
    );
  }
  touch(event.component);
};

/** Moving one occurrence with scope "series" moves the master by the same offset and keeps the new duration. */
const shiftSeries = (master: ICAL.Event, occurrenceKey: string, edit: EventEdit): void => {
  const occurrence = master.getOccurrenceDetails(occurrenceTime(master, occurrenceKey));
  const allDay = edit.allDay ?? master.startDate.isDate;
  const oldStart = new Date(toIso(occurrence.startDate)).getTime();
  const oldEnd = new Date(toIso(occurrence.endDate)).getTime();
  const newStart = edit.startAt ? new Date(edit.startAt).getTime() : oldStart;
  const newEnd = edit.endAt ? new Date(edit.endAt).getTime() : newStart + (oldEnd - oldStart);
  const masterStart = new Date(toIso(master.startDate)).getTime() + (newStart - oldStart);

  setTimes(
    master,
    {
      startAt: new Date(masterStart).toISOString(),
      endAt: new Date(masterStart + (newEnd - newStart)).toISOString(),
      allDay
    },
    master.startDate.zone
  );
};

/**
 * Removes an event. Returns null when the whole resource must be deleted,
 * otherwise the updated ICS (occurrence excluded with EXDATE).
 */
export const applyEventDelete = (ics: string, uid: string, occurrenceKey: string, scope: RecurrenceScope): string | null => {
  const root = parse(ics);
  const masterComponent = findMaster(root, uid);

  if (!masterComponent || !new ICAL.Event(masterComponent).isRecurring() || scope === "series" || !occurrenceKey) {
    return null;
  }

  const master = new ICAL.Event(masterComponent);
  const exdate = new ICAL.Property("exdate");
  const time = occurrenceTime(master, occurrenceKey);
  if (!time.isDate && time.zone && time.zone !== ICAL.Timezone.utcTimezone && time.zone !== ICAL.Timezone.localTimezone) {
    exdate.setParameter("tzid", time.zone.tzid);
  }
  exdate.setValue(time);
  masterComponent.addProperty(exdate);
  touch(masterComponent);

  const exception = findException(root, uid, occurrenceKey);
  if (exception) {
    root.removeSubcomponent(exception);
  }
  return root.toString();
};
