import type { Evt, Meeting } from "@/shared/types";
import { findKeys } from "../events/keys";
import { normalized } from "./distribute";

/** A chat message about a task this close to a call (before it / after it) says what the call was about. */
const CHAT_BEFORE_MS = 45 * 60_000;
const CHAT_AFTER_MS = 30 * 60_000;
/** Calls never take more than this share of a day, however long they are. */
export const MAX_CALL_SHARE = 0.5;

export interface CallTime {
  /** Minutes per task key. */
  minutes: Record<string, number>;
  /** Titles of the calls that went to each key. */
  titles: Record<string, string[]>;
}

/** The setting's value as a task key, or null when empty/invalid. */
export const callsKey = (raw: string): string | null => findKeys(raw.trim().toUpperCase())[0] ?? null;

/**
 * Where the time of calls goes. A call whose title has a task key already counts for it, so it is skipped.
 * A call after which/around which the chat mentions a task (e.g. a sync with QA) goes to that task;
 * any other call (daily, discussing future work) goes to `fallback`.
 */
export function callTime(
  meetings: Meeting[],
  events: Evt[],
  fallback: string,
  isCtx: (key: string) => boolean = () => false,
): CallTime {
  const out: CallTime = { minutes: {}, titles: {} };
  const chat = events.filter((e) => e.source === "matrix" && e.issueKey && !isCtx(e.issueKey));

  for (const m of meetings) {
    if (!m.isCall || m.tentative || m.minutes <= 0 || findKeys(m.title).length > 0) continue;
    const hits: Record<string, number> = {};
    for (const e of chat) {
      if (e.ts >= m.ts - CHAT_BEFORE_MS && e.ts <= m.endTs + CHAT_AFTER_MS) hits[e.issueKey!] = (hits[e.issueKey!] ?? 0) + 1;
    }
    const key = Object.entries(hits).sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
    out.minutes[key] = (out.minutes[key] ?? 0) + m.minutes;
    (out.titles[key] ??= []).push(m.title);
  }
  return out;
}

/**
 * Gives calls their share of the day: minutes / day norm (at most MAX_CALL_SHARE), the rest stays
 * split as before. A day without task activity is left to the gap filler.
 */
export function mixCalls(weights: Record<string, number>, minutes: Record<string, number>, dayHours: number): Record<string, number> {
  const total = Object.values(minutes).reduce((s, x) => s + x, 0);
  if (total <= 0 || dayHours <= 0 || Object.keys(weights).length === 0) return weights;
  const share = Math.min(MAX_CALL_SHARE, total / 60 / dayHours);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(normalized(weights))) out[k] = v * (1 - share);
  for (const [k, v] of Object.entries(normalized(minutes))) out[k] = (out[k] ?? 0) + v * share;
  return out;
}
