/**
 * Theme persistence and blocking script for flash-free theme switching.
 *
 * How it works:
 * 1. <ThemeScript /> renders a blocking <script> in <head> that reads
 *    the saved theme from localStorage and applies the CSS class on <html>
 *    BEFORE first paint — preventing any flash of wrong theme (FOUC).
 * 2. `getTheme()` / `setTheme()` provide a simple API for reading/writing
 *    the persisted preference from client code.
 * 3. `applyTheme()` updates the DOM to match a given theme. Called from
 *    the Zustand settings effect whenever `settings.theme` changes.
 *
 * color-scheme is handled in CSS (globals.css) via :root / .light selectors
 * to avoid inline style hydration mismatches.
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "open-analyst.theme";
const DEFAULT_THEME: Theme = "light";

/** Read the persisted theme. Safe to call on server (returns default). */
export function getTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return DEFAULT_THEME;
  }
}

/** Persist theme choice to localStorage. */
export function setTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage full or blocked — ignore
  }
}

/** Apply theme to the document (class only — color-scheme is in CSS). */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  if (theme === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }
}

/**
 * Inline script source that runs in <head> before paint.
 * Only touches classList — no inline styles — to avoid hydration mismatches.
 * The <html> element must have suppressHydrationWarning for the class diff.
 */
export const themeBlockingScript = `(function(){try{if(localStorage.getItem("${STORAGE_KEY}")==="light")document.documentElement.classList.add("light")}catch(e){}})()`;
