/** Programs the settings offer as ready choices; `id` is the part of the program's name that is matched. */
export interface KnownApp { id: string; name: string; browser?: boolean }

export const KNOWN_APPS: KnownApp[] = [
  { id: "zoom", name: "Zoom" },
  { id: "teams", name: "Microsoft Teams" },
  { id: "telegram", name: "Telegram" },
  { id: "slack", name: "Slack" },
  { id: "discord", name: "Discord" },
  { id: "skype", name: "Skype" },
  { id: "chrome", name: "Google Chrome", browser: true },
  { id: "msedge", name: "Microsoft Edge", browser: true },
  { id: "firefox", name: "Firefox", browser: true },
  { id: "browser", name: "Яндекс Браузер", browser: true },
];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const isOn = (list: string[], id: string): boolean => list.some((x) => same(x, id));

/** Programs in the list that are not among the known ones: typed by the user. */
export const customApps = (list: string[]): string[] => list.filter((x) => !KNOWN_APPS.some((k) => same(k.id, x)));

export const setApp = (list: string[], id: string, on: boolean): string[] => (on ? (isOn(list, id) ? list : [...list, id]) : list.filter((x) => !same(x, id)));

/** Adds a typed name (without ".exe", lower case), ignoring empty and repeated ones. */
export function addCustom(list: string[], raw: string): string[] {
  const name = raw.trim().toLowerCase().replace(/\.exe$/, "");
  return name ? setApp(list, name, true) : list;
}

/** A program as the user knows it: "teams" -> "Microsoft Teams"; a typed one stays as typed. */
export const appName = (id: string): string => KNOWN_APPS.find((k) => same(k.id, id))?.name ?? id;

export interface DayCalls<T> { day: string; calls: T[] }

/** Calls grouped by the local day they began, newest day first and the calls of a day in time order. */
export function groupByDay<T extends { started: number }>(calls: T[], dayOf: (ms: number) => string): DayCalls<T>[] {
  const days = new Map<string, T[]>();
  for (const c of [...calls].sort((a, b) => a.started - b.started)) {
    const d = dayOf(c.started);
    days.set(d, [...(days.get(d) ?? []), c]);
  }
  return [...days].map(([day, list]) => ({ day, calls: list })).reverse();
}
