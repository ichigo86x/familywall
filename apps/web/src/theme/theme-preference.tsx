import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** Per device: a wall panel can stay dark while a phone follows the system. */
const STORAGE_KEY = "familywall.theme";
const ORDER: ThemePreference[] = ["auto", "light", "dark"];

const readPreference = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
};

const systemTheme = (): ResolvedTheme => (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export const ThemePreferenceProvider = ({ children }: { children: (resolved: ResolvedTheme) => React.ReactNode }) => {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) {
      return;
    }
    const update = () => setSystem(query.matches ? "dark" : "light");
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const resolved: ResolvedTheme = preference === "auto" ? system : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#12161A" : "#3A7D6E");
  }, [resolved]);

  const value = useMemo<ThemeState>(
    () => ({
      preference,
      resolved,
      cycle: () => {
        const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]!;
        setPreference(next);
        try {
          if (next === "auto") {
            window.localStorage.removeItem(STORAGE_KEY);
          } else {
            window.localStorage.setItem(STORAGE_KEY, next);
          }
        } catch {
          // Private mode: the choice lasts for this session only.
        }
      }
    }),
    [preference, resolved]
  );

  return <ThemeContext.Provider value={value}>{children(resolved)}</ThemeContext.Provider>;
};

export const useThemePreference = (): ThemeState => {
  const state = useContext(ThemeContext);
  if (!state) {
    throw new Error("useThemePreference must be used inside ThemePreferenceProvider");
  }
  return state;
};
