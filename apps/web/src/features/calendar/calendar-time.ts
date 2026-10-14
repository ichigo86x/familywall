import type { FamilyEvent } from "@familywall/shared";

export type PlannerMode = "week" | "biweek" | "month";

const pad = (value: number) => String(value).padStart(2, "0");

export const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const addDays = (value: Date, amount: number) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount);

export const startOfWeek = (value: Date) => {
  const day = value.getDay();
  return addDays(startOfDay(value), day === 0 ? -6 : 1 - day);
};

/** Days rendered by the planner; month view always shows whole Monday-Sunday weeks. */
export const plannerDays = (mode: PlannerMode, anchor: Date): Date[] => {
  if (mode === "month") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const gridStart = startOfWeek(first);
    const weeks = Math.ceil((Math.round((last.getTime() - gridStart.getTime()) / 86_400_000) + 1) / 7);
    return Array.from({ length: weeks * 7 }, (_, index) => addDays(gridStart, index));
  }

  const start = startOfWeek(anchor);
  return Array.from({ length: mode === "week" ? 7 : 14 }, (_, index) => addDays(start, index));
};

/** Birthday calendars from providers have plain titles: they get the cake that Familywall occasions already carry. */
export const birthdayTitle = (title: string): string => (/^\p{Extended_Pictographic}/u.test(title) ? title : `🎂 ${title}`);

export const dayKey = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

/**
 * Local start/end of an event. All-day events travel as UTC midnight of their dates
 * (end exclusive), so they are rebuilt as local dates to avoid shifting by the timezone offset.
 */
export const eventBounds = (event: Pick<FamilyEvent, "startAt" | "endAt" | "allDay">): { start: Date; end: Date } => {
  if (event.allDay) {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    return {
      start: new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
      end: new Date(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
    };
  }
  return { start: new Date(event.startAt), end: new Date(event.endAt) };
};

export const occursOnDay = (event: FamilyEvent, day: Date): boolean => {
  const { start, end } = eventBounds(event);
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  // Zero-length events still belong to the day they start on.
  return start < dayEnd && (end > dayStart || (end.getTime() === start.getTime() && start >= dayStart));
};

export const timeLabel = (event: FamilyEvent): string => {
  if (event.allDay) {
    return "Tutto il giorno";
  }
  const format = (value: Date) => value.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const { start, end } = eventBounds(event);
  return `${format(start)} - ${format(end)}`;
};

/** Value for <input type="datetime-local"> or <input type="date">. */
export const toInputValue = (value: Date, allDay: boolean): string => {
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return allDay ? date : `${date}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

/** Converts editor inputs to the API shape. All-day end dates are inclusive in the UI and exclusive in the API. */
export const fromInputs = (startInput: string, endInput: string, allDay: boolean): { startAt: string; endAt: string } => {
  if (allDay) {
    const [startY, startM, startD] = startInput.split("-").map(Number) as [number, number, number];
    const [endY, endM, endD] = endInput.split("-").map(Number) as [number, number, number];
    return {
      startAt: new Date(Date.UTC(startY, startM - 1, startD)).toISOString(),
      endAt: new Date(Date.UTC(endY, endM - 1, endD + 1)).toISOString()
    };
  }
  return { startAt: new Date(startInput).toISOString(), endAt: new Date(endInput).toISOString() };
};

export const plannerTitle = (mode: PlannerMode, anchor: Date): string => {
  if (mode === "month") {
    return anchor.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  }
  const days = plannerDays(mode, anchor);
  const format = (value: Date) => value.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return `${format(days[0]!)} - ${format(days[days.length - 1]!)}`;
};

/** Whole days from one local date key (YYYY-MM-DD) to another. */
export const daysBetweenKeys = (from: string, to: string): number => {
  const parse = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year!, month! - 1, day!);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
};

/** An event time moved by whole days: all-day times stay UTC midnights, timed ones keep their local clock time. */
export const shiftEventTime = (iso: string, days: number, allDay: boolean): string => {
  const date = new Date(iso);
  if (allDay) {
    date.setUTCDate(date.getUTCDate() + days);
  } else {
    date.setDate(date.getDate() + days);
  }
  return date.toISOString();
};
