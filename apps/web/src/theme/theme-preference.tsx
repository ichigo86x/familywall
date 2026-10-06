import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
/** Text size: "auto" picks a bigger size on large screens (Echo Show 15, TVs). */
export type ScalePreference = "auto" | "100" | "115" | "130" | "150";

/** Per device: a wall panel can stay dark and large while a phone follows the system. */
const STORAGE_KEY = "familywall.theme";
const SCALE_KEY = "familywall.scale";
const ORDER: ThemePreference[] = ["auto", "light", "dark"];
export const SCALE_OPTIONS: ScalePreference[] = ["auto", "100", "115", "130", "150"];

const readStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string | null) => {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Private mode: the choice lasts for this session only.
  }
};

const readPreference = (): ThemePreference => {
  const stored = readStorage(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "auto";
};

const isScale = (value: string | null): value is ScalePreference => SCALE_OPTIONS.includes(value as ScalePreference);

/** A kiosk start URL can set the size once, e.g. http://host:8099/?scale=130 (then it is remembered). */
const readScale = (): ScalePreference => {
  const fromUrl = new URLSearchParams(window.location.search).get("scale");
  if (isScale(fromUrl)) {
    writeStorage(SCALE_KEY, fromUrl === "auto" ? null : fromUrl);
    return fromUrl;
  }
  const stored = readStorage(SCALE_KEY);
  return isScale(stored) ? stored : "auto";
};

/** Automatic size from the viewport (either orientation): wall panels are read from a few metres away. */
export const autoScale = (width: number, height: number): number => {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long >= 1800 && short >= 950) {
    return 1.3;
  }
  if (long >= 1500 && short >= 800) {
    return 1.15;
  }
  return 1;
};

const systemTheme = (): ResolvedTheme => (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  cycle: () => void;
  setPreference: (preference: ThemePreference) => void;
  scalePreference: ScalePreference;
  /** Effective text scale (1 = normal). */
  scale: number;
  setScale: (scale: ScalePreference) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export const ThemePreferenceProvider = ({ children }: { children: (resolved: ResolvedTheme, scale: number) => React.ReactNode }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  const [scalePreference, setScalePreference] = useState<ScalePreference>(readScale);
  const [size, setSize] = useState(viewport);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) {
      return;
    }
    const update = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setSize(viewport());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const resolved: ResolvedTheme = preference === "auto" ? system : preference;
  const scale = scalePreference === "auto" ? autoScale(size.width, size.height) : Number(scalePreference) / 100;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#12161A" : "#3A7D6E");
  }, [resolved]);

  // Every rem in styles.css follows the root size; Fluent components follow the scaled theme.
  useEffect(() => {
    document.documentElement.style.fontSize = scale === 1 ? "" : `${16 * scale}px`;
  }, [scale]);

  const value = useMemo<ThemeState>(() => {
    const setPreference = (next: ThemePreference) => {
      setPreferenceState(next);
      writeStorage(STORAGE_KEY, next === "auto" ? null : next);
    };
    return {
      preference,
      resolved,
      setPreference,
      cycle: () => setPreference(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]!),
      scalePreference,
      scale,
      setScale: (next) => {
        setScalePreference(next);
        writeStorage(SCALE_KEY, next === "auto" ? null : next);
      }
    };
  }, [preference, resolved, scalePreference, scale]);

  return <ThemeContext.Provider value={value}>{children(resolved, scale)}</ThemeContext.Provider>;
};

export const useThemePreference = (): ThemeState => {
  const state = useContext(ThemeContext);
  if (!state) {
    throw new Error("useThemePreference must be used inside ThemePreferenceProvider");
  }
  return state;
};
