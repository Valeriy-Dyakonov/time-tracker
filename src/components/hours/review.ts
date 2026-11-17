import type { Analysis, DayPlan, Source } from "../../types";
import { dayTotal } from "../../lib/allocate";
import { formatRu } from "../../lib/dates";
import { fmtH } from "../../lib/report";

const EPS = 0.001;

export const isBalanced = (d: DayPlan): boolean => d.off || Math.abs(dayTotal(d) - d.target) < EPS;

export const needsReview = (d: DayPlan): boolean => !d.off && (d.basis !== "activity" || !isBalanced(d));

/** Why a day is in the "check me" list, in plain words. */
export function reviewReason(d: DayPlan): string {
  if (d.basis === "empty") return "Нет событий — день не заполнен";
  if (d.basis === "inferred")
    return d.inferredFrom ? `Нет событий — часы взяты со дня ${formatRu(d.inferredFrom).slice(0, 5)}` : "Нет событий — часы распределены по периоду";
  return `Сумма ${fmtH(dayTotal(d))} ч, а норма ${fmtH(d.target)} ч`;
}

export function sourceCounts(days: DayPlan[]): [Source, number][] {
  const m = new Map<Source, number>();
  for (const d of days) for (const e of d.evidence) m.set(e.source, (m.get(e.source) ?? 0) + 1);
  return [...m.entries()].sort((x, y) => y[1] - x[1]);
}

export const dayCopyText = (a: Analysis, d: DayPlan): string =>
  `${formatRu(d.date)}\n` + d.tasks.map((t) => `${t.key} ${a.issues[t.key]?.summary ?? ""}: ${fmtH(t.hours)} ч`).join("\n") + `\nИтого: ${fmtH(dayTotal(d))} ч`;

export const percent = (part: number, whole: number): number => (whole ? (part / whole) * 100 : 0);
