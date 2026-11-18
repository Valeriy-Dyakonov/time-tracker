import type { DayPlan } from "../types";
import { minutes } from "./worklogSync";

/** A day whose booked time breaks the working-time limit. */
export interface DayOver {
  date: string;
  minutes: number;
  /** The day's norm in minutes; 0 on days off and days outside the calculation. */
  limit: number;
  off: boolean;
}

export interface LimitReport {
  /** Dates outside the analysed period. */
  outside: string[];
  overDays: DayOver[];
  total: number;
  /** Sum of the working days' norms of the period. */
  limit: number;
  ok: boolean;
}

/** Checks minutes per day against the calendar of the analysis: day norms, days off and the period norm. */
export function checkLimits(perDay: Map<string, number>, days: DayPlan[], start: string, end: string): LimitReport {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const limit = days.reduce((s, d) => s + (d.off ? 0 : minutes(d.target)), 0);
  const outside: string[] = [];
  const overDays: DayOver[] = [];
  let total = 0;
  for (const [date, mins] of [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (mins <= 0) continue;
    total += mins;
    if (date < start || date > end) { outside.push(date); continue; }
    const d = byDate.get(date);
    const off = !d || d.off;
    const dayLimit = off ? 0 : minutes(d.target);
    if (mins > dayLimit) overDays.push({ date, minutes: mins, limit: dayLimit, off });
  }
  return { outside, overDays, total, limit, ok: outside.length === 0 && overDays.length === 0 && total <= limit };
}

/** Minutes per day of a set of rows. */
export function perDay(items: { date: string; minutes: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of items) m.set(x.date, (m.get(x.date) ?? 0) + x.minutes);
  return m;
}
