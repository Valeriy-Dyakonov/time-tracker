import { api } from "@/shared/api";
import type { DayProgress, Evt, Meeting } from "@/shared/types";
import { eachDate, isoWeekday } from "@/shared/lib/dates";
import { groupByDay, localDay } from "../events/days";
import { callsKey, callTime, mixCalls } from "../plan/calls";
import { distribute } from "../plan/distribute";
import type { DayActivity } from "../plan/types";
import { dayAllocator } from "./dayAllocators";
import { bySource, dayLabel, msg, nEv, pool } from "./format";
import { normFor, type RunContext } from "./types";

/** Calendar entries without a task key are only context: a day with nothing but meetings has no task activity. */
const isActivity = (e: Evt) => e.source !== "calendar" || !!e.issueKey;

/** Live per-day status shown while the analysis runs. */
export class ProgressBoard {
  private days: DayProgress[];

  constructor(dates: string[], byDay: Record<string, Evt[]>, meetingsByDay: Record<string, Meeting[]>, private onDays: (d: DayProgress[]) => void) {
    this.days = dates.map((date) => {
      const active = (byDay[date] ?? []).some(isActivity);
      const mc = meetingsByDay[date]?.length ?? 0;
      return {
        date, events: byDay[date]?.length ?? 0, status: active ? "queued" : "nodata",
        note: active ? undefined : mc ? msg().days.onlyCalls(mc) : msg().days.noEvents,
      };
    });
    onDays(this.days);
  }

  patch(date: string, p: Partial<DayProgress>): void {
    this.days = this.days.map((d) => (d.date === date ? { ...d, ...p } : d));
    this.onDays(this.days);
  }
}

export interface DaysResult {
  activity: Record<string, DayActivity>;
  meetingsByDay: Record<string, Meeting[]>;
  board: ProgressBoard;
  aiDays: number;
  withEvents: number;
}

/** The task for calls without a task of their own, read from Jira so its title shows up; null = feature off. */
async function loadCallsTask(ctx: RunContext): Promise<string | null> {
  const raw = ctx.settings.callsTaskKey.trim();
  if (!raw) return null;
  const m = msg().calls;
  const key = callsKey(raw);
  if (!key) {
    ctx.warnings.push(m.badKey(raw));
    return null;
  }
  if (!ctx.issues[key]) {
    try {
      for (const i of await api.lookupIssues([key])) ctx.issues[i.key] = i;
    } catch (e) {
      ctx.log("warn", msg().enrich.lookupFailed(String(e)));
    }
  }
  if (!ctx.issues[key]) {
    ctx.warnings.push(m.notFound(key));
    return null;
  }
  ctx.log("info", m.enabled(key));
  return key;
}

/** Adds the time of the day's calls to the day's split and notes which calls it was. */
function withCalls(ctx: RunContext, act: DayActivity, date: string, meetings: Meeting[], events: Evt[], fallback: string, label: string): DayActivity {
  const calls = callTime(meetings, events, fallback, ctx.isCtx);
  const weights = mixCalls(act.weights, calls.minutes, normFor(ctx, date));
  if (weights === act.weights) return act;
  const m = msg().calls;
  const notes = { ...act.notes };
  for (const [key, titles] of Object.entries(calls.titles)) notes[key] = [...(notes[key] ?? []), m.note([...new Set(titles)].join(", "))];
  const spent = Object.entries(calls.minutes).map(([k, min]) => `${k} ${min}`).join(", ");
  ctx.log("info", m.day(label, spent));
  return { ...act, weights, notes, reasoning: `${act.reasoning} ${m.reasoning(spent)}`.trim() };
}

/** Matches events to working days by time and splits each day with events between tasks. */
export async function analyseDays(ctx: RunContext, dates: string[], onDays: (d: DayProgress[]) => void): Promise<DaysResult> {
  const byDay = groupByDay(ctx.events);
  const inRange = new Set(eachDate(ctx.o.start, ctx.o.end));
  for (const d of Object.keys(byDay).sort()) {
    if (inRange.has(d) && !ctx.settings.workdays.includes(isoWeekday(d)))
      ctx.log("info", msg().days.offDay(dayLabel(d), nEv(byDay[d].length)));
  }

  const meetingsByDay: Record<string, Meeting[]> = {};
  for (const m of ctx.meetings) (meetingsByDay[localDay(m.ts)] ??= []).push(m);
  const board = new ProgressBoard(dates, byDay, meetingsByDay, onDays);

  const withEvents = dates.filter((d) => (byDay[d] ?? []).some(isActivity));
  ctx.log("info", msg().days.withEvents(withEvents.length, dates.length));

  const callsTo = await loadCallsTask(ctx);
  const allocator = dayAllocator(ctx);
  const activity: Record<string, DayActivity> = {};
  let aiDays = 0;

  await pool(withEvents, 3, async (date) => {
    const events = byDay[date];
    const label = dayLabel(date);
    board.patch(date, { status: "running" });
    ctx.log("info", msg().days.dayEvents(label, nEv(events.length), bySource(events), events.filter((e) => e.issueKey).length));

    const r = await allocator.allocate({ date, label, events, byDay });
    if (r.usedAi) aiDays += 1;
    if (callsTo) r.act = withCalls(ctx, r.act, date, meetingsByDay[date] ?? [], events, callsTo, label);
    activity[date] = r.act;
    const hrs = distribute(r.act.weights, normFor(ctx, date));
    board.patch(date, { status: r.status, note: r.note, tasks: Object.entries(hrs).map(([key, hours]) => ({ key, hours })) });
  });

  return { activity, meetingsByDay, board, aiDays, withEvents: withEvents.length };
}
