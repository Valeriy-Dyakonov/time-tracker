import { api } from "../../api";
import type { DayPlan, FillMode } from "../../types";
import { weekdayName } from "../dates";
import { projectOf } from "../events/keys";
import { buildNarrativePrompt, NARRATIVE_SYSTEM, parseNarrative } from "../prompt";
import { fmtH, templateNarrative, type TaskTotal } from "../report";
import type { ProgressBoard } from "./days";
import { sd } from "./format";
import type { RunContext } from "./types";

const MODE_NAME: Record<FillMode, string> = { neighbors: "по соседним дням", period: "по всему периоду", none: "оставить пустыми" };

/** Logs how days without data were filled and shows the result on the progress board. */
export function reportGaps(ctx: RunContext, days: DayPlan[], board: ProgressBoard): void {
  const gaps = days.filter((d) => d.basis !== "activity");
  if (gaps.length) {
    ctx.log("info", `Дней без привязки к задачам: ${gaps.length}. Режим заполнения: «${MODE_NAME[ctx.o.fillMode]}».`);
    for (const d of gaps) ctx.log(d.basis === "empty" ? "warn" : "info", `${sd(d.date)} (${weekdayName(d.date)}): ${d.reasoning}`);
  }
  const empty = days.filter((d) => d.basis === "empty");
  if (empty.length) ctx.warnings.push(`Не заполнены дни: ${empty.map((d) => sd(d.date)).join(", ")}.`);
  for (const d of days.filter((x) => x.basis === "inferred"))
    board.patch(d.date, { note: d.inferredFrom ? `заполнен по ${sd(d.inferredFrom)}` : "заполнен по всему периоду", tasks: d.tasks.map((t) => ({ key: t.key, hours: t.hours })) });
}

export function logProjects(ctx: RunContext, totals: TaskTotal[]): void {
  const byProject = new Map<string, number>();
  for (const t of totals) byProject.set(projectOf(t.key), (byProject.get(projectOf(t.key)) ?? 0) + t.hours);
  if (byProject.size)
    ctx.log("info", `Часы начислены по проектам: ${[...byProject.entries()].sort((a, b) => b[1] - a[1]).map(([p, h]) => `${p} (${fmtH(h)} ч)`).join(", ")}. Лишний проект можно перенести в «только для контекста» в настройках Jira.`);
}

/** Summary of the whole period: written by the AI when it is on, otherwise from a template. */
export async function periodNarrative(ctx: RunContext, days: DayPlan[], totals: TaskTotal[]): Promise<string> {
  let narrative = "";
  if (ctx.aiOn && totals.length > 0) {
    ctx.log("info", "Итог периода: прошу ИИ описать картину целиком…");
    try {
      const raw = await api.llmChat(
        NARRATIVE_SYSTEM,
        buildNarrativePrompt({
          start: ctx.o.start, end: ctx.o.end, hoursPerDay: ctx.o.hoursPerDay, totals,
          days: days.map((d) => ({ date: d.date, hours: d.tasks.reduce((s, t) => s + t.hours, 0), basis: d.basis, summary: d.summary })),
        }),
      );
      narrative = parseNarrative(raw) ?? "";
      ctx.log(narrative ? "ok" : "warn", narrative ? "Итог периода получен." : "ИИ вернул пустой итог — использован шаблон.");
    } catch (e) {
      ctx.log("warn", `Итог периода: ошибка ИИ (${e}) — использован шаблон.`);
    }
  }
  return narrative || templateNarrative(ctx.o.start, ctx.o.end, days, ctx.issues);
}
