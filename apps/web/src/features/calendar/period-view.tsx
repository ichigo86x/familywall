import { useState } from "react";
import { Button } from "@fluentui/react-components";

import { ArrowLeftRegular, ArrowRightRegular } from "@/lib/fluent-icons";
import { addDays, startOfWeek } from "./calendar-time";

/** Views of the Menu and Turni pages: one week, two weeks, or the whole month in full weeks. */
export type PeriodMode = "week" | "fortnight" | "month";

const MODES: Array<{ value: PeriodMode; label: string }> = [
  { value: "week", label: "Settimana" },
  { value: "fortnight", label: "14 giorni" },
  { value: "month", label: "Mese" }
];

/** Two weeks unless the device chose another view. */
const DEFAULT_MODE: PeriodMode = "fortnight";

const readMode = (key: string): PeriodMode => {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === "week" || stored === "fortnight" || stored === "month" ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
};

export interface Period {
  mode: PeriodMode;
  setMode: (mode: PeriodMode) => void;
  /** Days shown, from Monday, in rows of seven. */
  days: Date[];
  /** First day shown and the day after the last one. */
  start: Date;
  end: Date;
  /** Days outside the month in the month view (shown faded). */
  outside: (day: Date) => boolean;
  label: string;
  previous: () => void;
  next: () => void;
  today: () => void;
  isCurrent: boolean;
}

/** The chosen view is remembered on the device, per page. */
export const usePeriod = (storageKey: string): Period => {
  const [mode, setModeState] = useState<PeriodMode>(() => readMode(storageKey));
  const [anchor, setAnchor] = useState(() => new Date());

  const setMode = (value: PeriodMode) => {
    setModeState(value);
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // Private mode: the view lasts until the page is closed.
    }
  };

  let start: Date;
  let length: number;
  if (mode === "month") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    start = startOfWeek(first);
    length = Math.round((addDays(startOfWeek(last), 7).getTime() - start.getTime()) / 86_400_000);
  } else {
    start = startOfWeek(anchor);
    length = mode === "week" ? 7 : 14;
  }
  const days = Array.from({ length }, (_, index) => addDays(start, index));
  const end = addDays(start, length);
  const step = (direction: number) =>
    setAnchor(mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1) : addDays(anchor, direction * (mode === "week" ? 7 : 14)));
  const now = new Date();

  const label =
    mode === "month"
      ? anchor.toLocaleDateString("it-IT", { month: "long", year: "numeric" })
      : mode === "week"
        ? `Settimana dal ${start.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`
        : `${start.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – ${addDays(end, -1).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;

  return {
    mode,
    setMode,
    days,
    start,
    end,
    outside: (day) => mode === "month" && day.getMonth() !== anchor.getMonth(),
    label,
    previous: () => step(-1),
    next: () => step(1),
    today: () => setAnchor(new Date()),
    isCurrent: now >= start && now < end
  };
};

const STEP_LABELS: Record<PeriodMode, { previous: string; next: string; today: string }> = {
  week: { previous: "Settimana precedente", next: "Settimana successiva", today: "Questa settimana" },
  fortnight: { previous: "Due settimane prima", next: "Due settimane dopo", today: "Oggi" },
  month: { previous: "Mese precedente", next: "Mese successivo", today: "Questo mese" }
};

/** View switch (week, 14 days, month) and the arrows to move through the period. */
export const PeriodToolbar = ({ period }: { period: Period }) => {
  const labels = STEP_LABELS[period.mode];
  return (
    <>
      <div className="calendar-toolbar__group" role="group" aria-label="Vista">
        {MODES.map((entry) => (
          <Button
            key={entry.value}
            appearance={period.mode === entry.value ? "primary" : "secondary"}
            aria-pressed={period.mode === entry.value}
            onClick={() => period.setMode(entry.value)}
          >
            {entry.label}
          </Button>
        ))}
      </div>
      <div className="calendar-toolbar__group">
        <Button appearance="secondary" icon={<ArrowLeftRegular />} aria-label={labels.previous} onClick={period.previous} />
        <Button appearance={period.isCurrent ? "subtle" : "secondary"} onClick={period.today}>
          {labels.today}
        </Button>
        <Button appearance="secondary" icon={<ArrowRightRegular />} aria-label={labels.next} onClick={period.next} />
      </div>
    </>
  );
};
