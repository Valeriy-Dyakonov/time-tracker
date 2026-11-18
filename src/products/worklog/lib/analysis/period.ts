import { api } from "@/shared/api";
import type { DayPlan } from "@/shared/types";
import { projectOf } from "../events/keys";
import { buildNarrativePrompt, narrativeSystemPrompt, parseNarrative } from "../ai/prompt";
import { fmtH, templateNarrative, type TaskTotal } from "../report/report";
import type { ProgressBoard } from "./days";
import { dayLabel, msg, sd } from "./format";
import type { RunContext } from "./types";

/** Logs how days without data were filled and shows the result on the progress board. */
export function reportGaps(ctx: RunContext, days: DayPlan[], board: ProgressBoard): void {
  const m = msg().period;
  const gaps = days.filter((d) => d.basis !== "activity" && d.basis !== "tempo");
  if (gaps.length) {
    ctx.log("info", m.gaps(gaps.length, m.modeName[ctx.o.fillMode]));
    for (const d of gaps) ctx.log(d.basis === "empty" ? "warn" : "info", `${dayLabel(d.date)}: ${d.reasoning}`);
  }
  const empty = days.filter((d) => d.basis === "empty");
  if (empty.length) ctx.warnings.push(m.notFilled(empty.map((d) => sd(d.date)).join(", ")));
  for (const d of days.filter((x) => x.basis === "inferred"))
    board.patch(d.date, { note: d.inferredFrom ? m.filledFrom(sd(d.inferredFrom)) : m.filledPeriod, tasks: d.tasks.map((t) => ({ key: t.key, hours: t.hours })) });
}

export function logProjects(ctx: RunContext, totals: TaskTotal[]): void {
  const byProject = new Map<string, number>();
  for (const t of totals) byProject.set(projectOf(t.key), (byProject.get(projectOf(t.key)) ?? 0) + t.hours);
  if (byProject.size)
    ctx.log("info", msg().period.projects([...byProject.entries()].sort((a, b) => b[1] - a[1]).map(([p, h]) => msg().period.projectHours(p, fmtH(h))).join(", ")));
}

/** Summary of the whole period: written by the AI when it is on, otherwise from a template. */
export async function periodNarrative(ctx: RunContext, days: DayPlan[], totals: TaskTotal[]): Promise<string> {
  const m = msg().period;
  let narrative = "";
  if (ctx.aiOn && totals.length > 0) {
    ctx.log("info", m.narrativeAsk);
    try {
      const raw = await api.llmChat(
        narrativeSystemPrompt(),
        buildNarrativePrompt({
          start: ctx.o.start, end: ctx.o.end, hoursPerDay: ctx.o.hoursPerDay, totals,
          days: days.map((d) => ({ date: d.date, hours: d.tasks.reduce((s, t) => s + t.hours, 0), basis: d.basis, summary: d.summary })),
        }),
      );
      narrative = parseNarrative(raw) ?? "";
      ctx.log(narrative ? "ok" : "warn", narrative ? m.narrativeOk : m.narrativeEmpty);
    } catch (e) {
      ctx.log("warn", m.narrativeError(String(e)));
    }
  }
  return narrative || templateNarrative(ctx.o.start, ctx.o.end, days, ctx.issues);
}
