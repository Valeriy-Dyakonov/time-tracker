import type { DayProgress, Evt, Meeting } from "../../types";
import { eachDate, isoWeekday } from "../dates";
import { groupByDay, localDay } from "../events/days";
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
    activity[date] = r.act;
    const hrs = distribute(r.act.weights, normFor(ctx, date));
    board.patch(date, { status: r.status, note: r.note, tasks: Object.entries(hrs).map(([key, hours]) => ({ key, hours })) });
  });

  return { activity, meetingsByDay, board, aiDays, withEvents: withEvents.length };
}
