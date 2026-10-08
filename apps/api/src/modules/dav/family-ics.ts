import ICAL from "ical.js";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  OCCASION_ICONS,
  ingredientsFromText,
  isoWeek,
  type FamilyNote,
  type MealSlot,
  type MenuMeal,
  type Occasion,
  type OccasionKind,
  type ScheduleEntry,
  type ScheduleKind,
  type WeekParity
} from "@familywall/shared";

/**
 * How family data maps to iCalendar objects on the built-in CalDAV server. Standard
 * properties carry what phones show and edit (title, dates, repetition, description);
 * X-FAMILYWALL-* properties keep what only Familywall knows. Reading prefers the standard
 * properties, so an edit made on a phone wins.
 */

export interface ReadContext {
  /** Household timezone, for times written in UTC by some clients. */
  timezone: string;
  now: Date;
}

export interface WriteContext {
  now: Date;
  created: boolean;
}

export interface IcsMapper<T, F> {
  component: "vevent" | "vjournal";
  read(component: ICAL.Component, id: string, context: ReadContext): T | null;
  write(component: ICAL.Component, fields: F, context: WriteContext): void;
}

const X_KIND = "x-familywall-kind";
const X_YEAR = "x-familywall-year";
const X_SLOT = "x-familywall-slot";
const X_WHO = "x-familywall-who";
const X_MEMBER = "x-familywall-member";
const X_PERSON = "x-familywall-person";
const X_COLOR = "x-familywall-color";
const X_PINNED = "x-familywall-pinned";
const X_DASHBOARD = "x-familywall-dashboard";
const X_CREATED_BY = "x-familywall-created-by";
const X_DONE = "x-familywall-done";
/** Chore completions older than this are dropped when a new one is written. */
const DONE_KEEP_DAYS = 62;

/** Year written for occasions whose year is unknown (a leap year, so 29 February fits). */
const NO_YEAR = 2000;
const NOTE_LINE = /^\s*nota\s*:\s*/i;

const pad = (value: number) => String(value).padStart(2, "0");

const text = (component: ICAL.Component, name: string): string => {
  const value = component.getFirstPropertyValue(name);
  return value === null || value === undefined ? "" : String(value).trim();
};

const setText = (component: ICAL.Component, name: string, value: string | null | undefined): void => {
  if (value) {
    component.updatePropertyWithValue(name, value);
  } else {
    component.removeAllProperties(name);
  }
};

const timeOf = (component: ICAL.Component, name: string): ICAL.Time | null => {
  const value = component.getFirstPropertyValue(name);
  return value instanceof ICAL.Time ? value : null;
};

const dateValue = (date: string): ICAL.Time => ICAL.Time.fromDateString(date);

const dateTimeValue = (date: string, time: string): ICAL.Time => ICAL.Time.fromDateTimeString(`${date}T${time}:00`);

const nextDay = (time: ICAL.Time): ICAL.Time => {
  const next = time.clone();
  next.addDuration(ICAL.Duration.fromData({ days: 1 }));
  return next;
};

/** Date and time on the household's wall clock (floating and TZID times are kept as written). */
const wallClock = (time: ICAL.Time, timezone: string): { date: string; time: string | null } => {
  if (time.isDate) {
    return { date: `${time.year}-${pad(time.month)}-${pad(time.day)}`, time: null };
  }
  if (time.zone === ICAL.Timezone.utcTimezone) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(time.toJSDate())
        .map((part) => [part.type, part.value])
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }
  return { date: `${time.year}-${pad(time.month)}-${pad(time.day)}`, time: `${pad(time.hour)}:${pad(time.minute)}` };
};

const setAllDay = (component: ICAL.Component, date: string): void => {
  const start = dateValue(date);
  component.updatePropertyWithValue("dtstart", start);
  component.updatePropertyWithValue("dtend", nextDay(start));
};

const rule = (component: ICAL.Component): ICAL.Recur | null => {
  const value = component.getFirstPropertyValue("rrule");
  return value instanceof ICAL.Recur ? value : null;
};

const setRule = (component: ICAL.Component, value: string | null): void => {
  component.removeAllProperties("rrule");
  if (value) {
    component.addPropertyWithValue("rrule", ICAL.Recur.fromString(value));
  }
};

const isOneOf = <T extends string>(values: readonly T[], value: string): value is T => (values as readonly string[]).includes(value);

/* ---------- Birthdays and anniversaries: yearly all-day events ("🎂 Luca"). ---------- */

export type OccasionFields = Omit<Occasion, "id">;

const OCCASION_KINDS: readonly OccasionKind[] = ["birthday", "anniversary", "other"];

export const occasionMapper: IcsMapper<Occasion, OccasionFields> = {
  component: "vevent",
  read(component, id, context) {
    const start = timeOf(component, "dtstart");
    const summary = text(component, "summary");
    if (!start || !summary) {
      return null;
    }
    const iconKind = OCCASION_KINDS.find((kind) => summary.startsWith(OCCASION_ICONS[kind]));
    const storedKind = text(component, X_KIND);
    const kind = isOneOf(OCCASION_KINDS, storedKind) ? storedKind : (iconKind ?? "birthday");
    const name = iconKind ? summary.slice(OCCASION_ICONS[iconKind].length).trim() : summary;
    const storedYear = text(component, X_YEAR);
    // Added on a phone: the start year is the year of birth, unless it is this year.
    const year =
      storedYear === "none" ? null : /^\d{4}$/.test(storedYear) ? Number(storedYear) : start.year >= 1900 && start.year < context.now.getFullYear() ? start.year : null;
    return { id, name: name || summary, kind, month: start.month, day: start.day, year };
  },
  write(component, fields) {
    const leapDay = fields.month === 2 && fields.day === 29;
    const leapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const startYear = fields.year !== null && (!leapDay || leapYear(fields.year)) ? fields.year : NO_YEAR;
    setText(component, "summary", `${OCCASION_ICONS[fields.kind]} ${fields.name}`);
    setAllDay(component, `${startYear}-${pad(fields.month)}-${pad(fields.day)}`);
    // 29 February falls on the last day of February in other years.
    setRule(component, leapDay ? "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1" : "FREQ=YEARLY");
    component.updatePropertyWithValue("transp", "TRANSPARENT");
    component.updatePropertyWithValue(X_KIND, fields.kind);
    component.updatePropertyWithValue(X_YEAR, fields.year === null ? "none" : String(fields.year));
  }
};

/* ---------- Family menu: all-day events ("Cena: Minestrone"), ingredients in the description. ---------- */

export type MenuMealFields = Omit<MenuMeal, "id">;

const slotByHour = (hour: number): MealSlot => (hour < 11 ? "colazione" : hour < 15 ? "pranzo" : hour < 18 ? "merenda" : "cena");

export const menuMapper: IcsMapper<MenuMeal, MenuMealFields> = {
  component: "vevent",
  read(component, id, context) {
    const start = timeOf(component, "dtstart");
    const summary = text(component, "summary");
    if (!start || !summary) {
      return null;
    }
    const prefixed = MEAL_SLOTS.find((slot) => summary.toLowerCase().startsWith(`${MEAL_SLOT_LABELS[slot].toLowerCase()}:`));
    const title = prefixed ? summary.slice(MEAL_SLOT_LABELS[prefixed].length + 1).trim() : summary;
    const storedSlot = text(component, X_SLOT);
    const slot = prefixed ?? (isOneOf(MEAL_SLOTS, storedSlot) ? storedSlot : start.isDate ? "cena" : slotByHour(start.hour));
    const lines = text(component, "description").split(/\r?\n/);
    const noteLine = lines.find((line) => NOTE_LINE.test(line));
    return {
      id,
      date: wallClock(start, context.timezone).date,
      slot,
      title: title || summary,
      ingredients: ingredientsFromText(lines.filter((line) => line !== noteLine).join("\n")),
      note: noteLine ? noteLine.replace(NOTE_LINE, "").trim() || null : null
    };
  },
  write(component, fields) {
    setText(component, "summary", `${MEAL_SLOT_LABELS[fields.slot]}: ${fields.title}`);
    setAllDay(component, fields.date);
    setText(component, "description", [...fields.ingredients, ...(fields.note ? ["", `Nota: ${fields.note}`] : [])].join("\n").trim());
    component.updatePropertyWithValue("transp", "TRANSPARENT");
    component.updatePropertyWithValue(X_SLOT, fields.slot);
  }
};

/* ---------- Shifts: weekly events ("Mario: Ufficio"), every other week with INTERVAL=2. ---------- */

export type ScheduleFields = Omit<ScheduleEntry, "id" | "done">;

const doneDates = (component: ICAL.Component): string[] =>
  text(component, X_DONE)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

/** Marks a chore done (or not) on a local date; old dates are dropped. */
export const setChoreDone = (component: ICAL.Component, date: string, done: boolean): void => {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const oldest = localDate(new Date(year, month - 1, day - DONE_KEEP_DAYS));
  const dates = new Set(doneDates(component).filter((value) => value >= oldest));
  if (done) {
    dates.add(date);
  } else {
    dates.delete(date);
  }
  setText(component, X_DONE, [...dates].sort().join(","));
};

/** Shifts are written with the name of who they belong to, so phones show it. */
export interface ScheduleWriteFields extends ScheduleFields {
  who: string | null;
}

const SCHEDULE_KINDS: readonly ScheduleKind[] = ["work", "chore", "presence"];
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** First day of the series: in this week, or the next one when the alternate week does not match. */
export const scheduleAnchor = (weekdays: number[], parity: WeekParity, now: Date): string => {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const wanted = parity === "even" ? 0 : 1;
  if (parity !== "all" && isoWeek(monday) % 2 !== wanted) {
    monday.setDate(monday.getDate() + 7);
  }
  const first = Math.min(...weekdays);
  return localDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + first - 1));
};

export const scheduleMapper: IcsMapper<ScheduleEntry, ScheduleWriteFields> = {
  component: "vevent",
  read(component, id, context) {
    const start = timeOf(component, "dtstart");
    const summary = text(component, "summary");
    if (!start || !summary) {
      return null;
    }
    const who = text(component, X_WHO);
    const title = who && summary.startsWith(`${who}: `) ? summary.slice(who.length + 2).trim() : summary;
    const storedKind = text(component, X_KIND);
    const begin = wallClock(start, context.timezone);
    const endTime = timeOf(component, "dtend");
    const end = endTime && !endTime.isDate ? wallClock(endTime, context.timezone) : null;

    const recurrence = rule(component);
    let weekdays: number[] = [];
    let weekParity: WeekParity = "all";
    let date: string | null = begin.date;
    if (recurrence && (recurrence.freq === "WEEKLY" || recurrence.freq === "DAILY")) {
      const byDay = (recurrence.parts.BYDAY ?? []) as string[];
      const [year, month, day] = begin.date.split("-").map(Number) as [number, number, number];
      const startDay = new Date(year, month - 1, day);
      weekdays =
        recurrence.freq === "DAILY" ? [1, 2, 3, 4, 5, 6, 7] : byDay.length > 0 ? byDay.map((value) => BYDAY.indexOf(value.slice(-2)) + 1).filter((value) => value > 0) : [((startDay.getDay() + 6) % 7) + 1];
      weekParity = recurrence.freq === "WEEKLY" && recurrence.interval === 2 ? (isoWeek(startDay) % 2 === 0 ? "even" : "odd") : "all";
      date = null;
    }

    return {
      id,
      kind: isOneOf(SCHEDULE_KINDS, storedKind) ? storedKind : "presence",
      title: title || summary,
      memberId: text(component, X_MEMBER) || null,
      person: text(component, X_PERSON) || null,
      weekdays: [...new Set(weekdays)].sort(),
      weekParity,
      date,
      startTime: begin.time,
      endTime: begin.time && end && end.date === begin.date && end.time! > begin.time ? end.time : null,
      note: text(component, "description") || null,
      done: doneDates(component)
    };
  },
  write(component, fields, context) {
    setText(component, "summary", fields.who ? `${fields.who}: ${fields.title}` : fields.title);
    const day = fields.date ?? scheduleAnchor(fields.weekdays, fields.weekParity, context.now);
    component.removeAllProperties("dtend");
    if (fields.startTime) {
      component.updatePropertyWithValue("dtstart", dateTimeValue(day, fields.startTime));
      if (fields.endTime) {
        component.updatePropertyWithValue("dtend", dateTimeValue(day, fields.endTime));
      }
    } else {
      setAllDay(component, day);
    }
    const byDay = [...new Set(fields.weekdays)].sort().map((weekday) => BYDAY[weekday - 1]).join(",");
    setRule(component, fields.date ? null : `FREQ=WEEKLY;INTERVAL=${fields.weekParity === "all" ? 1 : 2};BYDAY=${byDay};WKST=MO`);
    setText(component, "description", fields.note?.trim());
    component.updatePropertyWithValue(X_KIND, fields.kind);
    setText(component, X_WHO, fields.who);
    setText(component, X_MEMBER, fields.memberId);
    setText(component, X_PERSON, fields.person?.trim());
  }
};

/* ---------- Notes board: journal entries (VJOURNAL). ---------- */

export interface NoteFields {
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  onDashboard: boolean;
  createdBy: string | null;
}

const DEFAULT_NOTE_COLOR = "#FFF4B8";

export const noteMapper: IcsMapper<FamilyNote, NoteFields> = {
  component: "vjournal",
  read(component, id) {
    const title = text(component, "summary");
    const body = component.getFirstPropertyValue("description");
    const bodyText = body === null || body === undefined ? "" : String(body);
    if (!title && !bodyText.trim()) {
      return null;
    }
    const modified = timeOf(component, "last-modified") ?? timeOf(component, "dtstamp") ?? timeOf(component, "created");
    const color = text(component, X_COLOR);
    return {
      id,
      title,
      body: bodyText,
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_NOTE_COLOR,
      pinned: text(component, X_PINNED) === "1",
      onDashboard: text(component, X_DASHBOARD) === "1",
      createdBy: text(component, X_CREATED_BY) || null,
      updatedAt: (modified ? modified.toJSDate() : new Date(0)).toISOString()
    };
  },
  write(component, fields, context) {
    setText(component, "summary", fields.title.trim());
    setText(component, "description", fields.body);
    if (context.created) {
      component.updatePropertyWithValue("dtstart", ICAL.Time.fromDateString(localDate(context.now)));
    }
    component.updatePropertyWithValue(X_COLOR, fields.color);
    component.updatePropertyWithValue(X_PINNED, fields.pinned ? "1" : "0");
    component.updatePropertyWithValue(X_DASHBOARD, fields.onDashboard ? "1" : "0");
    setText(component, X_CREATED_BY, fields.createdBy);
  }
};
