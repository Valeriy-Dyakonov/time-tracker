import type { Analysis, LogEntry, LogLevel, Settings } from "../types";
import { analyseDays } from "./analysis/days";
import { IssueEnricher } from "./analysis/enrich";
import { logProjects, periodNarrative, reportGaps } from "./analysis/period";
import { COLLECT_STEPS } from "./analysis/steps";
import type { RunContext, RunHandlers, RunOptions } from "./analysis/types";
import { loadWorkCalendar } from "./analysis/workCalendar";
import { formatRu, localDate, WEEKDAYS_SHORT } from "./dates";
import { projectOf } from "./events/keys";
import { buildPlan } from "./plan/buildPlan";
import { fmtH, totalsOf } from "./report";

export type { RunHandlers, RunOptions } from "./analysis/types";

/** Collect -> enrich -> split each day -> fill the gaps -> describe the period. */
export async function runAnalysis(settings: Settings, o: RunOptions, h: RunHandlers): Promise<Analysis> {
  const logs: LogEntry[] = [];
  const log = (level: LogLevel, msg: string) => {
    const e = { t: Date.now(), level, msg };
    logs.push(e);
    h.onLog(e);
  };

  const ctxProjects = new Set(settings.contextProjects.map((p) => p.trim().toUpperCase()).filter(Boolean));
  const cal = await loadWorkCalendar(settings, o.start, o.end, o.hoursPerDay, log);
  const ctx: RunContext = {
    settings, o, log,
    issues: {}, events: [], meetings: [],
    warnings: cal.warning ? [cal.warning] : [],
    targets: cal.targets,
    aiOn: o.useAi && !!settings.llmBaseUrl && !!settings.llmModel,
    isCtx: (key: string) => ctxProjects.has(projectOf(key)),
    enrich: new IssueEnricher(),
  };
  const { dates } = cal;

  log("info", `Период ${formatRu(o.start)} – ${formatRu(o.end)}, норма ${fmtH(o.hoursPerDay)} ч в день, рабочие дни: ${settings.workdays.map((d) => WEEKDAYS_SHORT[d - 1]).join(", ")}.`);
  if (ctxProjects.size) log("info", `Проекты только для контекста (часы на них не начисляются): ${[...ctxProjects].join(", ")}.`);
  log("info", `К заполнению ${dates.length} рабочих дн.${o.end > localDate(new Date()) ? " (будущие дни не заполняются)" : ""}. Анализ ИИ: ${ctx.aiOn ? "включён" : "выключен — будет эвристика"}.`);

  for (const [i, step] of COLLECT_STEPS.entries()) {
    log("info", `━━ Шаг ${i + 1} из ${COLLECT_STEPS.length}: ${step.title}`);
    await step.run(ctx);
  }
  await ctx.enrich.secondPass(ctx);
  ctx.enrich.dropUnknownKeys(ctx);
  log("info", "━━ Анализ по дням: события сопоставляются по времени (коммиты, Jira, звонки, чат), затем часы распределяются, дни без данных заполняются.");

  const r = await analyseDays(ctx, dates, h.onDays);
  const days = buildPlan(dates, r.activity, ctx.issues, o.hoursPerDay, o.fillMode, r.meetingsByDay, ctx.targets);
  reportGaps(ctx, days, r.board);

  const totals = totalsOf(days, ctx.issues);
  logProjects(ctx, totals);
  const narrative = await periodNarrative(ctx, days, totals);

  const total = days.reduce((s, d) => s + d.tasks.reduce((x, t) => x + t.hours, 0), 0);
  log("ok", `Готово: ${fmtH(total)} ч из ${fmtH(days.reduce((s, d) => s + d.target, 0))} ч; задач ${totals.length}; ИИ использован в ${r.aiDays} из ${r.withEvents} дней с событиями.`);

  return {
    start: o.start, end: o.end, hoursPerDay: o.hoursPerDay, jiraUrl: settings.jiraUrl.trim().replace(/\/+$/, ""), days, issues: ctx.issues, warnings: ctx.warnings,
    usedAi: r.aiDays > 0, fillMode: o.fillMode, narrative, log: logs, createdAt: Date.now(),
  };
}
