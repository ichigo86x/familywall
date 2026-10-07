import { useEffect } from "react";

import { useNow } from "@/components/live-clock";

/** Fully Kiosk Browser JavaScript interface (Settings → Advanced Web Settings → Enable JavaScript Interface). */
interface FullyApi {
  getScreenBrightness?: () => number;
  setScreenBrightness?: (value: number) => void;
}

const NIGHT_BRIGHTNESS = 5;

/**
 * Night mode of wall panels: black screen with a dim, slowly drifting clock.
 * With Fully Kiosk's JavaScript interface the screen backlight is turned down too.
 */
export const NightScreen = ({ onWake }: { onWake: () => void }) => {
  const now = useNow();

  useEffect(() => {
    const fully = (window as Window & { fully?: FullyApi }).fully;
    if (!fully?.getScreenBrightness || !fully.setScreenBrightness) {
      return;
    }
    const before = fully.getScreenBrightness();
    fully.setScreenBrightness(NIGHT_BRIGHTNESS);
    return () => fully.setScreenBrightness?.(before > NIGHT_BRIGHTNESS ? before : 128);
  }, []);

  // Moves a little every minute against burn-in.
  const minute = now.getHours() * 60 + now.getMinutes();
  const offsetX = Math.sin(minute / 5) * 18;
  const offsetY = Math.cos(minute / 9) * 14;

  return (
    <div className="night-screen" role="dialog" aria-label="Pannello in modalità notte: tocca per riattivare" onClick={onWake}>
      <div className="night-screen__clock" style={{ transform: `translate(calc(-50% + ${offsetX}vw), calc(-50% + ${offsetY}vh))` }}>
        <strong>{now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</strong>
        <span>{now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</span>
      </div>
    </div>
  );
};
