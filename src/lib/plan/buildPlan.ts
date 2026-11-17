import type { DayPlan, FillMode, IssueInfo, Meeting } from "../../types";
import { distribute, toTasks } from "./distribute";
import { autoSummary, gapFiller } from "./fill";
import type { DayActivity } from "./types";

function whyNoData(own: DayActivity | undefined, hasMeetings: boolean): string {
  if (own) return `События за этот день не удалось привязать ни к одной задаче, на которую начисляются часы.${own.reasoning ? ` ${own.reasoning}` : ""}`;
  if (hasMeetings) return "В этот день были только звонки и встречи — по ним задачу определить нельзя.";
  return "За этот день нет ни действий в Jira, ни коммитов, ни сообщений.";
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
): DayPlan[] {
  const filler = gapFiller(fillMode, activity, issues);

  return dates.map((date): DayPlan => {
    const own = activity[date];
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
      const tasks = toTasks(distribute(own.weights, target), own.notes);
      return { ...base, tasks, basis: "activity", summary: own.summary || autoSummary(tasks, issues), reasoning: own.reasoning };
    }
    return filler.fill({ date, target, base, why: whyNoData(own, (meetings[date]?.length ?? 0) > 0) });
  });
}
