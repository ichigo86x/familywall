import { z } from "zod";
import { isoWeekdaySchema, localDateKey } from "./schedule";

/** One step of a routine, shown as a big icon ("🪥 Lavarsi i denti"). */
export interface RoutineStep {
  icon: string;
  label: string;
}

/**
 * A morning or evening routine for children: steps to tick on the wall panel with a countdown
 * to the deadline (e.g. leaving for school). Ticks reset every day.
 */
export interface Routine {
  id: string;
  title: string;
  /** Child the routine belongs to; null = the whole family. */
  memberId: string | null;
  /** ISO weekdays (1 = Monday). */
  weekdays: number[];
  /** Shown on the dashboard from this time... */
  startTime: string;
  /** ...with a countdown to this one (shown until half an hour later). */
  endTime: string;
  steps: RoutineStep[];
  /** Steps ticked today (indexes), with the date they belong to. */
  progress: { date: string; done: number[] } | null;
}

export interface RoutinesResponse {
  routines: Routine[];
}

export interface RoutineResponse {
  routine: Routine;
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario HH:MM");

export const routineStepSchema = z.object({
  icon: z.string().trim().min(1).max(16),
  label: z.string().trim().min(1).max(60)
});

export const routineSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    memberId: z.string().min(1).nullable().default(null),
    weekdays: z.array(isoWeekdaySchema).min(1, "Scegli almeno un giorno").max(7),
    startTime: time,
    endTime: time,
    steps: z.array(routineStepSchema).min(1, "Aggiungi almeno un passo").max(12)
  })
  .refine((routine) => routine.endTime > routine.startTime, { message: "La fine deve essere dopo l'inizio", path: ["endTime"] });

export type RoutineInput = z.input<typeof routineSchema>;

export const routineStepDoneSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  step: z.number().int().min(0).max(11),
  done: z.boolean()
});

export type RoutineStepDoneInput = z.infer<typeof routineStepDoneSchema>;

/** The routine stays on the dashboard for this long after its end time. */
export const ROUTINE_GRACE_MINUTES = 30;

const minutesOf = (value: string): number => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

/** Whether the routine is shown at a local time (between its start and half an hour after its end). */
export const routineActiveAt = (routine: Pick<Routine, "weekdays" | "startTime" | "endTime">, now: Date): boolean => {
  const weekday = now.getDay() || 7;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return routine.weekdays.includes(weekday) && minutes >= minutesOf(routine.startTime) && minutes < minutesOf(routine.endTime) + ROUTINE_GRACE_MINUTES;
};

/** Steps ticked on a local day (ticks of other days do not count). */
export const routineDoneOn = (routine: Pick<Routine, "progress">, day: Date): number[] =>
  routine.progress && routine.progress.date === localDateKey(day) ? routine.progress.done : [];

/** Minutes left to the end time (negative when late). */
export const routineMinutesLeft = (routine: Pick<Routine, "endTime">, now: Date): number => minutesOf(routine.endTime) - (now.getHours() * 60 + now.getMinutes());

/** "🪥 Lavarsi i denti" → icon and label (a line without an emoji gets a dot). */
export const parseRoutineStep = (line: string): RoutineStep | null => {
  const text = line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim();
  if (!text) {
    return null;
  }
  const match = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*(.*)$/u.exec(text);
  return match && match[2] ? { icon: match[1]!, label: match[2].trim() } : { icon: "•", label: text };
};

export const ROUTINE_TEMPLATES: Record<"mattina" | "sera", { title: string; startTime: string; endTime: string; steps: RoutineStep[] }> = {
  mattina: {
    title: "Mattina",
    startTime: "07:00",
    endTime: "07:45",
    steps: [
      { icon: "🛏️", label: "Alzarsi e rifare il letto" },
      { icon: "🚽", label: "Bagno" },
      { icon: "👕", label: "Vestirsi" },
      { icon: "🥣", label: "Colazione" },
      { icon: "🪥", label: "Lavarsi i denti" },
      { icon: "🎒", label: "Zaino pronto" },
      { icon: "🧥", label: "Giacca e scarpe" }
    ]
  },
  sera: {
    title: "Sera",
    startTime: "20:00",
    endTime: "21:00",
    steps: [
      { icon: "🧸", label: "Mettere in ordine i giochi" },
      { icon: "🎒", label: "Preparare lo zaino" },
      { icon: "🛁", label: "Bagno o doccia" },
      { icon: "🩳", label: "Pigiama" },
      { icon: "🪥", label: "Lavarsi i denti" },
      { icon: "📖", label: "Leggere una storia" }
    ]
  }
};
