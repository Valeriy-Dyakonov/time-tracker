import type { Analysis, DayPlan, Source } from "../../types";
import { dayTotal } from "../../lib/allocate";
import { dateShort, t } from "../../i18n";
import { formatDate } from "../../lib/dates";
import { fmtH } from "../../lib/report";

const EPS = 0.001;

export const isBalanced = (d: DayPlan): boolean => d.off || Math.abs(dayTotal(d) - d.target) < EPS;

/** The day rests on its own data: analysed events or what is already logged in Tempo. */
export const hasOwnData = (d: DayPlan): boolean => d.basis === "activity" || d.basis === "tempo";

export const needsReview = (d: DayPlan): boolean => !d.off && (!hasOwnData(d) || (d.basis === "activity" && !isBalanced(d)));

/** Why a day is in the "check me" list, in plain words. */
export function reviewReason(d: DayPlan): string {
  const r = t().hours.reason;
  if (d.basis === "empty") return r.empty;
  if (d.basis === "inferred") return d.inferredFrom ? r.inferredFrom(dateShort(d.inferredFrom)) : r.inferredPeriod;
  return r.unbalanced(fmtH(dayTotal(d)), fmtH(d.target));
}

export function sourceCounts(days: DayPlan[]): [Source, number][] {
  const m = new Map<Source, number>();
  for (const d of days) for (const e of d.evidence) m.set(e.source, (m.get(e.source) ?? 0) + 1);
  return [...m.entries()].sort((x, y) => y[1] - x[1]);
}

export function dayCopyText(a: Analysis, d: DayPlan): string {
  const m = t();
  const lines = d.tasks.map((x) => `${x.key} ${a.issues[x.key]?.summary ?? ""}: ${m.common.hoursValue(fmtH(x.hours))}`);
  return [formatDate(d.date), ...lines, m.hours.day.copyTotal(fmtH(dayTotal(d)))].join("\n");
}

export const percent = (part: number, whole: number): number => (whole ? (part / whole) * 100 : 0);
