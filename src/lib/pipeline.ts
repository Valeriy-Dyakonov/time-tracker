import type { Analysis, LogEntry, LogLevel, Settings } from "../types";
import { analyseDays } from "./analysis/days";
import { IssueEnricher } from "./analysis/enrich";
import { logProjects, periodNarrative, reportGaps } from "./analysis/period";
import { polishNotes } from "./analysis/polish";
import { COLLECT_STEPS } from "./analysis/steps";
import type { RunContext, RunHandlers, RunOptions } from "./analysis/types";
import { loadWorkCalendar } from "./analysis/workCalendar";
import { weekdayShort } from "../i18n";
import { formatDate, localDate } from "./dates";
import { msg } from "./analysis/format";
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
    // Hours go only to the user's own tasks: someone else's task touched via a comment or a commit is context.
    isCtx: (key: string) => ctxProjects.has(projectOf(key)) || ctx.issues[key]?.assignedToMe === false,
    enrich: new IssueEnricher(),
  };
  const { dates } = cal;

  const m = msg().log;
  log("info", m.period(formatDate(o.start), formatDate(o.end), fmtH(o.hoursPerDay), settings.workdays.map(weekdayShort).join(", ")));
  if (ctxProjects.size) log("info", m.contextProjects([...ctxProjects].join(", ")));
  log("info", m.toFill(dates.length, o.end > localDate(new Date()), ctx.aiOn));

  for (const [i, step] of COLLECT_STEPS.entries()) {
    log("info", m.step(i + 1, COLLECT_STEPS.length, step.title));
    await step.run(ctx);
  }
  await ctx.enrich.secondPass(ctx);
  ctx.enrich.dropUnknownKeys(ctx);
  const notMine = [...new Set(ctx.events.map((e) => e.issueKey).filter((k): k is string => !!k && ctx.issues[k]?.assignedToMe === false))];
  if (notMine.length) log("info", m.notAssigned(notMine.length, notMine.slice(0, 8).join(", ")));
  log("info", m.daysStage);

  const r = await analyseDays(ctx, dates, h.onDays);
  const planned = buildPlan(dates, r.activity, ctx.issues, o.hoursPerDay, o.fillMode, r.meetingsByDay, ctx.targets);
  reportGaps(ctx, planned, r.board);
  const days = await polishNotes(ctx, planned);

  const totals = totalsOf(days, ctx.issues);
  logProjects(ctx, totals);
  const narrative = await periodNarrative(ctx, days, totals);

  const total = days.reduce((s, d) => s + d.tasks.reduce((x, t) => x + t.hours, 0), 0);
  log("ok", m.done(fmtH(total), fmtH(days.reduce((s, d) => s + d.target, 0)), totals.length, r.aiDays, r.withEvents));

  return {
    start: o.start, end: o.end, hoursPerDay: o.hoursPerDay, jiraUrl: settings.jiraUrl.trim().replace(/\/+$/, ""), days, issues: ctx.issues, warnings: ctx.warnings,
    usedAi: r.aiDays > 0, fillMode: o.fillMode, narrative, log: logs, createdAt: Date.now(),
  };
}
