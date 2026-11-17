import { useSyncExternalStore } from "react";
import { t } from "./i18n";

export type ThemeId = "system" | "light" | "dark" | "sepia" | "graphite" | "contrast";

export interface ThemeInfo {
  id: ThemeId;
  /** Colours for the preview card; kept in sync with styles/themes.css. */
  preview: { bg: string; card: string; text: string; muted: string; line: string; accent: string };
}

const LIGHT = { bg: "#f5f6f8", card: "#fff", text: "#1c2330", muted: "#6b7686", line: "#e3e6ec", accent: "#2f6fed" };
const DARK = { bg: "#14171c", card: "#1c2027", text: "#e6e9ef", muted: "#8b95a5", line: "#2b313b", accent: "#5b8cff" };

export const THEMES: ThemeInfo[] = [
  { id: "system", preview: LIGHT },
  { id: "light", preview: LIGHT },
  { id: "dark", preview: DARK },
  { id: "sepia", preview: { bg: "#f1e8d4", card: "#fbf6ea", text: "#3b2f22", muted: "#7d6b55", line: "#e0d2b4", accent: "#a0522d" } },
  { id: "graphite", preview: { bg: "#2e3440", card: "#3b4252", text: "#eceff4", muted: "#a3adbf", line: "#4c566a", accent: "#88c0d0" } },
  { id: "contrast", preview: { bg: "#fff", card: "#fff", text: "#000", muted: "#3a3a3a", line: "#7a7a7a", accent: "#0040a8" } },
];

/** Name and one-line description of a theme in the current language. */
export const themeText = (id: ThemeId): { label: string; sub: string } => t().settings.appearance.themes[id];

export const SYSTEM_DARK_PREVIEW = DARK;

const KEY = "worklog.theme";
const listeners = new Set<() => void>();

export function readTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY) as ThemeId | null;
    return v && THEMES.some((t) => t.id === v) ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(id: ThemeId) {
  if (id === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", id);
}

export function setTheme(id: ThemeId) {
  try { localStorage.setItem(KEY, id); } catch { /* storage unavailable: theme lasts until restart */ }
  applyTheme(id);
  listeners.forEach((l) => l());
}

export function useTheme(): ThemeId {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, readTheme);
}
