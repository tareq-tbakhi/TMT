/**
 * PreferencesContext — user-facing appearance & accessibility settings.
 *
 * Drives the design-token system in styles/theme.css by setting data
 * attributes on <html>:
 *   data-theme, data-contrast, data-font-scale, data-motion, data-accent
 *
 * Persisted to localStorage so choices survive restarts (works in the
 * Capacitor webview too). System theme is respected until the user
 * explicitly overrides it.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemeSetting = "system" | "light" | "dark";
export type FontScale = "md" | "lg" | "xl" | "xxl";
export type AccentRole =
  | "patient"
  | "hospital"
  | "police"
  | "civil_defense"
  | "firefighter"
  | "admin";

export interface Preferences {
  theme: ThemeSetting;
  fontScale: FontScale;
  highContrast: boolean;
  reducedMotion: boolean;
}

interface PreferencesContextValue extends Preferences {
  /** The theme actually applied after resolving "system". */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeSetting) => void;
  setFontScale: (scale: FontScale) => void;
  setHighContrast: (on: boolean) => void;
  setReducedMotion: (on: boolean) => void;
}

const STORAGE_KEY = "tmt-preferences";

const DEFAULTS: Preferences = {
  theme: "system",
  fontScale: "md",
  highContrast: false,
  reducedMotion: false,
};

function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Track OS theme changes while in "system" mode
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "light" | "dark" =
    prefs.theme === "system" ? (systemDark ? "dark" : "light") : prefs.theme;

  // Apply to <html> + persist
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolvedTheme);
    root.setAttribute("data-font-scale", prefs.fontScale);
    if (prefs.highContrast) root.setAttribute("data-contrast", "high");
    else root.removeAttribute("data-contrast");
    if (prefs.reducedMotion) root.setAttribute("data-motion", "reduce");
    else root.removeAttribute("data-motion");
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [prefs, resolvedTheme]);

  const setTheme = useCallback(
    (theme: ThemeSetting) => setPrefs((p) => ({ ...p, theme })),
    []
  );
  const setFontScale = useCallback(
    (fontScale: FontScale) => setPrefs((p) => ({ ...p, fontScale })),
    []
  );
  const setHighContrast = useCallback(
    (highContrast: boolean) => setPrefs((p) => ({ ...p, highContrast })),
    []
  );
  const setReducedMotion = useCallback(
    (reducedMotion: boolean) => setPrefs((p) => ({ ...p, reducedMotion })),
    []
  );

  const value = useMemo(
    () => ({
      ...prefs,
      resolvedTheme,
      setTheme,
      setFontScale,
      setHighContrast,
      setReducedMotion,
    }),
    [prefs, resolvedTheme, setTheme, setFontScale, setHighContrast, setReducedMotion]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx)
    throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}

/**
 * Sets the role accent color for a section of the app (e.g. police pages).
 * Call once in each layout component.
 */
export function useAccent(role: AccentRole): void {
  useEffect(() => {
    document.documentElement.setAttribute("data-accent", role);
    return () => {
      document.documentElement.removeAttribute("data-accent");
    };
  }, [role]);
}
