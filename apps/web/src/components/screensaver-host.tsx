import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DEFAULT_SCREENSAVER_MINUTES, isNightTime, panelView, type PanelNight } from "@familywall/shared";

import { api } from "@/api/client";
import { useNow } from "@/components/live-clock";
import { NightScreen } from "@/features/dashboard/night-screen";
import { Screensaver } from "@/features/dashboard/screensaver";

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

interface PanelTiming {
  night: PanelNight | null;
  /** Minutes without touches before the screensaver; 0 = never. */
  screensaverMinutes: number;
}

/**
 * Night hours and screensaver delay of this panel (its own profile, or the family ones),
 * re-read now and then so Admin changes reach panels that never reload.
 */
const usePanelTiming = (enabled: boolean, memberId: string | undefined): PanelTiming => {
  const [timing, setTiming] = useState<PanelTiming>({ night: null, screensaverMinutes: DEFAULT_SCREENSAVER_MINUTES });
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    const load = () =>
      api
        .getSettings()
        .then((settings) => {
          if (active) {
            const view = panelView({ ...settings, panelProfiles: settings.panelProfiles ?? {} }, memberId);
            setTiming({ night: view.night ?? null, screensaverMinutes: view.screensaverMinutes });
          }
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, SETTINGS_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, memberId]);
  return enabled ? timing : { night: null, screensaverMinutes: 0 };
};

interface ScreensaverHostProps {
  /** Wall panel (Kiosk account): idle screensaver and night mode. */
  panel: boolean;
  /** The idle screensaver is off on some pages (Admin). */
  idleStart: boolean;
  /** The signed-in panel, for its own settings. */
  memberId?: string;
  children: React.ReactNode;
}

/** Owns the screensaver of a page: started by a tap on the clock or, on wall panels, by inactivity and at night. */
export const ScreensaverHost = ({ panel, idleStart, memberId, children }: ScreensaverHostProps) => {
  const now = useNow();
  const [active, setActive] = useState(false);
  const [awakeAtNight, setAwakeAtNight] = useState(false);
  const start = useCallback(() => setActive(true), []);
  const exit = useCallback(() => setActive(false), []);

  const { night: nightWindow, screensaverMinutes } = usePanelTiming(panel, memberId);
  const night = nightWindow ? isNightTime(nightWindow, now) : false;
  const dark = night && !awakeAtNight;

  useEffect(() => {
    if (!night) {
      setAwakeAtNight(false);
    }
  }, [night]);

  useIdle(panel && idleStart && !active && !night && screensaverMinutes > 0, Math.max(screensaverMinutes, 1) * 60 * 1000, start);
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
