import { z } from "zod";

/**
 * Household "shifts": recurring weekly entries shown on the dashboard.
 * - work: where a parent works that day (smart working / office / ...)
 * - chore: a child's daily chore (set the table, clear the table, ...)
 * - presence: someone coming to the house (cleaning lady, babysitter, ...)
 */
export const scheduleKindSchema = z.enum(["work", "chore", "presence"]);
export type ScheduleKind = z.infer<typeof scheduleKindSchema>;

/** ISO weekdays: 1 = Monday ... 7 = Sunday. */
export const isoWeekdaySchema = z.number().int().min(1).max(7);

/** Alternating weeks follow the ISO week number. */
export const weekParitySchema = z.enum(["all", "even", "odd"]);
export type WeekParity = z.infer<typeof weekParitySchema>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario HH:MM");

export interface ScheduleEntry {
  id: string;
  kind: ScheduleKind;
  /** e.g. "Smart working", "Ufficio", "Apparecchiare", "Pulizie". */
  title: string;
  /** Family member involved (parents for work, children for chores). */
  memberId: string | null;
  /** Someone who is not a member, e.g. "Maria" for the cleaning lady. */
  person: string | null;
  /** Repeating weekdays; empty when the entry is for a single date. */
  weekdays: number[];
  weekParity: WeekParity;
  /** Single date (YYYY-MM-DD) instead of a weekly repetition. */
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  /** Chores: local dates (YYYY-MM-DD) on which it was done, last two months. */
  done: string[];
}

export interface ScheduleResponse {
  entries: ScheduleEntry[];
}

export interface ScheduleEntryResponse {
  entry: ScheduleEntry;
}

export const scheduleEntrySchema = z
  .object({
    kind: scheduleKindSchema,
    title: z.string().trim().min(1).max(60),
    memberId: z.string().min(1).nullable().default(null),
    person: z.string().trim().max(60).nullable().default(null),
    weekdays: z.array(isoWeekdaySchema).max(7).default([]),
    weekParity: weekParitySchema.default("all"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    startTime: time.nullable().default(null),
    endTime: time.nullable().default(null),
    note: z.string().trim().max(200).nullable().default(null)
  })
  .refine((entry) => entry.date !== null || entry.weekdays.length > 0, { message: "Scegli almeno un giorno o una data", path: ["weekdays"] })
  .refine((entry) => entry.memberId !== null || (entry.person ?? "").trim() !== "", { message: "Indica un membro o una persona", path: ["memberId"] })
  .refine((entry) => !entry.startTime || !entry.endTime || entry.endTime > entry.startTime, { message: "La fine deve essere dopo l'inizio", path: ["endTime"] });

export type ScheduleEntryInput = z.input<typeof scheduleEntrySchema>;

export const choreDoneSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  done: z.boolean()
});

export type ChoreDoneInput = z.infer<typeof choreDoneSchema>;

/** Stars of the week (Monday to Sunday around a day): one per chore done, by member id. */
export const weekStars = (entries: ScheduleEntry[], day: Date): Map<string, number> => {
  const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7));
  const from = localDateKey(monday);
  const to = localDateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
  const stars = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== "chore" || !entry.memberId) {
      continue;
    }
    const count = entry.done.filter((date) => date >= from && date <= to).length;
    stars.set(entry.memberId, (stars.get(entry.memberId) ?? 0) + count);
  }
  return stars;
};

/** Whether an entry applies on a local day. */
export const scheduleAppliesOn = (entry: ScheduleEntry, day: Date): boolean => scheduleForDay([entry], day).length === 1;

/** ISO week number of a local date. */
export const isoWeek = (date: Date): number => {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
};

export const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Entries that apply on a given local day, sorted by kind, then time, then title. */
export const scheduleForDay = (entries: ScheduleEntry[], day: Date): ScheduleEntry[] => {
  const weekday = day.getDay() || 7;
  const parity = isoWeek(day) % 2 === 0 ? "even" : "odd";
  const key = localDateKey(day);
  const order: Record<ScheduleKind, number> = { work: 0, chore: 1, presence: 2 };
  return entries
    .filter((entry) =>
      entry.date !== null ? entry.date === key : entry.weekdays.includes(weekday) && (entry.weekParity === "all" || entry.weekParity === parity)
    )
    .sort(
      (left, right) =>
        order[left.kind] - order[right.kind] ||
        (left.startTime ?? "").localeCompare(right.startTime ?? "") ||
        left.title.localeCompare(right.title)
    );
};

/** Chores are ticked by the child they belong to, by parents and on the wall panel. */
export const canTickChore = (user: { id: string; role: string }, entry: Pick<ScheduleEntry, "kind" | "memberId">): boolean =>
  entry.kind === "chore" && (user.role !== "Child" || entry.memberId === user.id);
