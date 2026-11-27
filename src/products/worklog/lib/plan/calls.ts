import type { Meeting, TaskHours } from "@/shared/types";
import { findKeys } from "../events/keys";
import { distribute, normalized, round } from "./distribute";

export interface CallTime {
  /** Minutes per task key. */
  minutes: Record<string, number>;
  /** Titles of the calls that went to each key. */
  titles: Record<string, string[]>;
}

/** The setting's value as a task key, or null when empty/invalid. */
export const callsKey = (raw: string): string | null => findKeys(raw.trim().toUpperCase())[0] ?? null;

/** A calendar or computer entry whose time is booked as a call. */
export const isCounted = (m: Meeting): boolean => m.isCall && !m.tentative && m.minutes > 0;

/**
 * Where the time of calls goes: to the task named in the call's title, if hours can be booked on it,
 * otherwise to `fallback`. Nothing else ties a call to a task: chat around a daily is not about it.
 */
export function callTime(meetings: Meeting[], fallback: string, canTake: (key: string) => boolean = () => true): CallTime {
  const out: CallTime = { minutes: {}, titles: {} };
  for (const m of meetings) {
    if (!isCounted(m)) continue;
    const key = findKeys(m.title).find(canTake) ?? fallback;
    out.minutes[key] = (out.minutes[key] ?? 0) + m.minutes;
    (out.titles[key] ??= []).push(m.title);
  }
  return out;
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((s, x) => s + x, 0);

/**
 * Gives calls their real share of a day with task activity (minutes / day norm), the rest stays split
 * as before. A day without task activity is left to the gap filler, see `addCalls`.
 */
export function mixCalls(weights: Record<string, number>, minutes: Record<string, number>, dayHours: number): Record<string, number> {
  const total = sum(minutes);
  if (total <= 0 || dayHours <= 0 || Object.keys(weights).length === 0) return weights;
  const share = Math.min(1, total / 60 / dayHours);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(normalized(weights))) out[k] = v * (1 - share);
  for (const [k, v] of Object.entries(normalized(minutes))) out[k] = (out[k] ?? 0) + v * share;
  return out;
}

/** Puts call hours into a filled day: the filler's tasks shrink to what the calls leave of the norm. */
export function addCalls(filled: TaskHours[], minutes: Record<string, number>, target: number): TaskHours[] {
  const callHours = Math.min(target, round(sum(minutes) / 60));
  if (callHours <= 0) return filled;
  const rest = distribute(Object.fromEntries(filled.map((x) => [x.key, x.hours])), target - callHours);
  const out: TaskHours[] = filled.filter((x) => rest[x.key]).map((x) => ({ ...x, hours: rest[x.key] }));
  for (const [key, hours] of Object.entries(distribute(minutes, callHours))) {
    const same = out.find((x) => x.key === key);
    if (same) same.hours += hours;
    else out.push({ key, hours, notes: [] });
  }
  return out;
}
