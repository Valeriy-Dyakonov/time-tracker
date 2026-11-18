import type { Evidence, Evt } from "@/shared/types";
import { eachDate, isoWeekday, localDate } from "@/shared/lib/dates";

export function localDay(ts: number): string {
  return localDate(new Date(ts));
}

export function groupByDay(events: Evt[]): Record<string, Evt[]> {
  const out: Record<string, Evt[]> = {};
  for (const e of events) (out[localDay(e.ts)] ??= []).push(e);
  for (const d of Object.keys(out)) out[d].sort((a, b) => a.ts - b.ts);
  return out;
}

export function workDates(
  start: string,
  end: string,
  workdays: number[],
  today: string,
  /** Production calendar: holidays to skip and transferred weekends that are worked. */
  calendar?: { off?: Set<string>; extra?: Set<string> },
): string[] {
  return eachDate(start, end).filter(
    (d) => d <= today && !calendar?.off?.has(d) && (workdays.includes(isoWeekday(d)) || !!calendar?.extra?.has(d)),
  );
}

export function toEvidence(events: Evt[], max = 200): Evidence[] {
  return events.slice(0, max).map((e) => ({
    ts: e.ts,
    source: e.source,
    key: e.issueKey,
    text: (e.source === "calendar" && e.context ? `${e.text} (${e.context})` : e.text).slice(0, 180),
    ...(e.source !== "calendar" && e.context ? { context: e.context.slice(0, 120) } : {}),
    ...(e.to ? { to: e.to } : {}),
  }));
}
