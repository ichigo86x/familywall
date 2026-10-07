import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isNightTime, type PanelNight } from "@familywall/shared";

import { api } from "@/api/client";
import { useNow } from "@/components/live-clock";
import { NightScreen } from "@/features/dashboard/night-screen";
import { Screensaver } from "@/features/dashboard/screensaver";

/** Wall panels (Kiosk accounts) start the screensaver after this much inactivity on any page. */
const IDLE_MS = 5 * 60 * 1000;
/** At night a tap wakes the panel; it goes dark again after this much inactivity. */
const NIGHT_WAKE_MS = 2 * 60 * 1000;
const SETTINGS_REFRESH_MS = 15 * 60 * 1000;

const StartScreensaver = createContext<() => void>(() => undefined);

/** Calls onIdle after a period without touches, clicks or keys (only while enabled). */
const useIdle = (enabled: boolean, delayMs: number, onIdle: () => void) => {
  const callback = useRef(onIdle);
  callback.current = onIdle;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let timer = window.setTimeout(() => callback.current(), delayMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), delayMs);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [enabled, delayMs]);
};

/** The panel night window, re-read now and then so Admin changes reach panels that never reload. */
const usePanelNight = (enabled: boolean): PanelNight | null => {
  const [night, setNight] = useState<PanelNight | null>(null);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    const load = () =>
      api
        .getSettings()
        .then((settings) => active && setNight(settings.panelNight ?? null))
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, SETTINGS_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled]);
  return enabled ? night : null;
};

interface ScreensaverHostProps {
  /** Wall panel (Kiosk account): idle screensaver and night mode. */
  panel: boolean;
  /** The idle screensaver is off on some pages (Admin). */
  idleStart: boolean;
  children: React.ReactNode;
}

/** Owns the screensaver of a page: started by a tap on the clock or, on wall panels, by inactivity and at night. */
export const ScreensaverHost = ({ panel, idleStart, children }: ScreensaverHostProps) => {
  const now = useNow();
  const [active, setActive] = useState(false);
  const [awakeAtNight, setAwakeAtNight] = useState(false);
  const start = useCallback(() => setActive(true), []);
  const exit = useCallback(() => setActive(false), []);

  const nightWindow = usePanelNight(panel);
  const night = nightWindow ? isNightTime(nightWindow, now) : false;
  const dark = night && !awakeAtNight;

  useEffect(() => {
    if (!night) {
      setAwakeAtNight(false);
    }
  }, [night]);

  useIdle(panel && idleStart && !active && !night, IDLE_MS, start);
  useIdle(night && awakeAtNight, NIGHT_WAKE_MS, () => setAwakeAtNight(false));

  return (
    <StartScreensaver.Provider value={start}>
      {children}
      {dark ? <NightScreen onWake={() => setAwakeAtNight(true)} /> : active ? <Screensaver onExit={exit} /> : null}
    </StartScreensaver.Provider>
  );
};

/** Starts the screensaver of the current page (e.g. tapping the dashboard clock). */
export const useStartScreensaver = () => useContext(StartScreensaver);
