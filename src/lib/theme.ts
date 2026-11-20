/**
 * Theme preference (DESIGN.md D3, Will 2026-11-03): dark-first by default, a toggle for
 * Dark / Light / System, and System follows the OS with a dark fallback.
 *
 * The resolved theme is written to <html data-theme="dark|light">; index.css keys the light
 * tokens on that attribute. index.html runs the same logic inline before first paint, so the
 * page never flashes the wrong theme.
 */
export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "hl-theme";
export const DEFAULT_PREFERENCE: ThemePreference = "dark";

export function isPreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

/** Reads the stored preference. Storage can be missing or throw (private mode); fall back. */
export function readPreference(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isPreference(value) ? value : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function writePreference(
  preference: ThemePreference,
  storage: Pick<Storage, "setItem"> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Preference just won't persist; the page still themes correctly.
  }
}

/** System follows the OS; with no OS preference (or no matchMedia) it falls back to dark. */
export function resolveTheme(
  preference: ThemePreference,
  matchMedia: ((query: string) => Pick<MediaQueryList, "matches">) | undefined = safeMatchMedia(),
): ResolvedTheme {
  if (preference !== "system") return preference;
  try {
    return matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function safeMatchMedia(): ((query: string) => MediaQueryList) | undefined {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia.bind(window)
    : undefined;
}
