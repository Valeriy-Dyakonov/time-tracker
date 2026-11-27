import { t } from "@/i18n";
import type { DayPlan, FillMode, IssueInfo, Meeting, TaskHours } from "@/shared/types";
import { addCalls, mixCalls, type CallTime } from "./calls";
import { distribute, toTasks } from "./distribute";
import { autoSummary, gapFiller } from "./fill";
import type { DayActivity } from "./types";

function whyNoData(own: DayActivity | undefined, hasMeetings: boolean): string {
  const plan = t().analysis.plan;
  if (own) return plan.whyUnmatched(own.reasoning);
  return hasMeetings ? plan.whyMeetingsOnly : plan.whyNothing;
}

/** Adds to each task the names of the calls booked on it. */
function noteCalls(tasks: TaskHours[], calls: CallTime): TaskHours[] {
  return tasks.map((x) => {
    const titles = calls.titles[x.key];
    return titles ? { ...x, notes: [...x.notes, t().analysis.calls.note([...new Set(titles)].join(", "))] } : x;
  });
}

const callsReasoning = (reasoning: string, calls: CallTime): string =>
  `${reasoning} ${t().analysis.calls.reasoning(Object.entries(calls.minutes).map(([k, min]) => `${k} ${min}`).join(", "))}`.trim();

/** Call time is a fact of its own day, so it is added after filling and never copied to other days. */
function withCalls(day: DayPlan, calls: CallTime, issues: Record<string, IssueInfo>): DayPlan {
  const tasks = addCalls(day.tasks, calls.minutes, day.target);
  if (tasks === day.tasks) return day;
  return {
    ...day,
    tasks: noteCalls(tasks, calls),
    basis: day.basis === "empty" ? "activity" : day.basis,
    summary: day.summary || autoSummary(tasks, issues),
    reasoning: callsReasoning(day.reasoning, calls),
  };
}

/**
 * Builds the per-day plan so that every working day adds up to its norm.
 * Days without usable activity are filled by the strategy for `fillMode` (see fill.ts).
 */
export function buildPlan(
  dates: string[],
  activity: Record<string, DayActivity>,
  issues: Record<string, IssueInfo>,
  hoursPerDay: number,
  fillMode: FillMode = "neighbors",
  meetings: Record<string, Meeting[]> = {},
  /** Per-date norm that differs from `hoursPerDay` (shortened pre-holiday days). */
  targets: Record<string, number> = {},
  /** Time of each day's calls per task; empty when call time is not booked. */
  calls: Record<string, CallTime> = {},
): DayPlan[] {
  const filler = gapFiller(fillMode, activity, issues);

  return dates.map((date): DayPlan => {
    const own = activity[date];
    const dayCalls = calls[date];
    const target = targets[date] ?? hoursPerDay;
    const base = {
      date,
      target,
      off: false,
      eventCount: own?.eventCount ?? 0,
      evidence: own?.evidence ?? [],
      meetings: meetings[date] ?? [],
    };

    if (own && Object.keys(own.weights).length > 0) {
      const weights = dayCalls ? mixCalls(own.weights, dayCalls.minutes, target) : own.weights;
      const mixed = weights !== own.weights;
      const split = toTasks(distribute(weights, target), own.notes);
      const tasks = mixed ? noteCalls(split, dayCalls!) : split;
      const reasoning = mixed ? callsReasoning(own.reasoning, dayCalls!) : own.reasoning;
      return { ...base, tasks, basis: "activity", summary: own.summary || autoSummary(tasks, issues), reasoning };
    }
    const filled = filler.fill({ date, target, base, why: whyNoData(own, (meetings[date]?.length ?? 0) > 0) });
    return dayCalls ? withCalls(filled, dayCalls, issues) : filled;
  });
}
