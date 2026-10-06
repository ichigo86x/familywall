import { useEffect, useState } from "react";

/** Current time, re-rendered at the start of every minute. */
export const useNow = (intervalMs = 60_000): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      setNow(new Date());
      // Align to the next minute (or interval) boundary so the clock never lags.
      timer = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 50);
    };
    timer = window.setTimeout(tick, intervalMs - (Date.now() % intervalMs) + 50);
    return () => window.clearTimeout(timer);
  }, [intervalMs]);
  return now;
};

export const LiveClock = ({ className = "live-clock" }: { className?: string }) => {
  const now = useNow();
  return (
    <div className={className} aria-label="Data e ora">
      <strong>{now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</strong>
      <span>{now.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}</span>
    </div>
  );
};
