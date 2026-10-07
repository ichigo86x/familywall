import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { Screensaver } from "@/features/dashboard/screensaver";

/** Wall panels (Kiosk accounts) start the screensaver after this much inactivity on any page. */
const IDLE_MS = 5 * 60 * 1000;

const StartScreensaver = createContext<() => void>(() => undefined);

/** Calls onIdle after a period without touches, clicks or keys (only while enabled). */
const useIdle = (enabled: boolean, onIdle: () => void) => {
  const callback = useRef(onIdle);
  callback.current = onIdle;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let timer = window.setTimeout(() => callback.current(), IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [enabled]);
};

/** Owns the screensaver of a page: started by the button or, on wall panels, by inactivity. */
export const ScreensaverHost = ({ idleStart, children }: { idleStart: boolean; children: React.ReactNode }) => {
  const [active, setActive] = useState(false);
  const start = useCallback(() => setActive(true), []);
  const exit = useCallback(() => setActive(false), []);
  useIdle(idleStart && !active, start);

  return (
    <StartScreensaver.Provider value={start}>
      {children}
      {active ? <Screensaver onExit={exit} /> : null}
    </StartScreensaver.Provider>
  );
};

/** Starts the screensaver of the current page (e.g. tapping the dashboard clock). */
export const useStartScreensaver = () => useContext(StartScreensaver);
