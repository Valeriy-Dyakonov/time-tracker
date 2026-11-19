import { defaultSettings, type Settings } from "@/shared/types";

const FORMAT = "worklog-tracker-settings";

/** Belong to one person or one computer (logins, folders, rooms): neither exported nor overwritten by an import. */
export const PERSONAL: (keyof Settings)[] = ["matrixUserId", "exchangeUser", "matrixExcludeRooms", "gitRoot", "gitRepos", "gitAuthors"];

/** Settings as a file: no passwords (they live in the OS store), language or theme (they live in this browser), nothing personal. */
export function exportSettings(s: Settings): string {
  const shared = Object.fromEntries(Object.entries(s).filter(([k]) => !PERSONAL.includes(k as keyof Settings)));
  return JSON.stringify({ format: FORMAT, version: 1, settings: shared }, null, 2);
}

const sameType = (a: unknown, b: unknown): boolean =>
  Array.isArray(b) ? Array.isArray(a) && a.every((x) => typeof x === typeof (b[0] ?? "")) : typeof a === typeof b;

/**
 * Reads a settings file over the defaults (personal fields stay as in `current`): unknown fields and fields of the wrong type are skipped,
 * so a file from another version cannot break the settings. Null when it is not a settings file.
 */
export function importSettings(text: string, current: Settings = defaultSettings): { settings: Settings; skipped: string[] } | null {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return null; }
  const src = (data as { format?: string; settings?: Record<string, unknown> } | null);
  if (!src || src.format !== FORMAT || !src.settings || typeof src.settings !== "object") return null;

  const settings: Record<string, unknown> = { ...defaultSettings };
  for (const k of PERSONAL) settings[k] = current[k];
  const skipped: string[] = [];
  for (const [k, v] of Object.entries(src.settings)) {
    if (k in defaultSettings && !PERSONAL.includes(k as keyof Settings) && sameType(v, (defaultSettings as unknown as Record<string, unknown>)[k])) settings[k] = v;
    else skipped.push(k);
  }
  return { settings: settings as unknown as Settings, skipped };
}
