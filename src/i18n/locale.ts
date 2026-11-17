import { useSyncExternalStore } from "react";

export type Locale = "ru" | "en";

export const LOCALES: { id: Locale; label: string }[] = [
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
];

const KEY = "worklog.locale";
const listeners = new Set<() => void>();

function detect(): Locale {
  return typeof navigator !== "undefined" && !navigator.language.toLowerCase().startsWith("ru") ? "en" : "ru";
}

let current: Locale = read();

function read(): Locale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ru" || v === "en") return v;
  } catch { /* storage unavailable: fall back to the system language */ }
  return detect();
}

export const getLocale = (): Locale => current;

export function applyLocale() {
  if (typeof document !== "undefined") document.documentElement.lang = current;
}

export function setLocale(l: Locale) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* the choice lasts until restart */ }
  applyLocale();
  listeners.forEach((f) => f());
}

export function useLocale(): Locale {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, getLocale);
}
