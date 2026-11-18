import { api } from "@/shared/api";
import type { DayPlan, JiraWorklog } from "@/shared/types";
import { autoSummary } from "../plan/fill";
import type { DayActivity } from "../plan/types";
import { minutes } from "../submit/sync";
import { listHead, msg, sd } from "./format";
import { normFor, type RunContext } from "./types";

/** Days the user already filled in Tempo: taken as they are, never re-analysed. */
export type TempoDays = Map<string, JiraWorklog[]>;

const mins = (x: JiraWorklog) => Math.round(x.seconds / 60);

/** Working days whose Tempo total reaches the day's norm. */
export function filledDays(list: JiraWorklog[], dates: string[], norm: (date: string) => number): TempoDays {
  const by = new Map<string, JiraWorklog[]>();
  for (const w of list) by.set(w.date, [...(by.get(w.date) ?? []), w]);
  const out: TempoDays = new Map();
  for (const d of dates) {
    const ws = by.get(d) ?? [];
    const logged = ws.reduce((s, w) => s + mins(w), 0);
    if (logged > 0 && logged >= minutes(norm(d))) out.set(d, ws);
  }
  return out;
}

/** Reads the user's worklogs for the period; a failure only means every day is analysed as usual. */
export async function loadTempoDays(ctx: RunContext, dates: string[]): Promise<TempoDays> {
  if (!(ctx.o.useJira && ctx.settings.jiraUrl)) return new Map();
  const m = msg().tempo;
  try {
    const days = filledDays(await api.jiraWorklogs(ctx.o.start, ctx.o.end), dates, (d) => normFor(ctx, d));
    if (days.size) ctx.log("ok", m.filled(days.size, dates.length, listHead([...days.keys()].map(sd), 10)));
    else ctx.log("info", m.none);
    return days;
  } catch (e) {
    ctx.log("warn", m.failed(String(e)));
    return new Map();
  }
}

/** Tasks logged in Tempo may be unknown to the run (logged by hand): read them so titles show up. */
export async function loadTempoIssues(ctx: RunContext, days: TempoDays): Promise<void> {
  const keys = [...new Set([...days.values()].flat().map((w) => w.key))].filter((k) => !ctx.issues[k]);
  if (!keys.length) return;
  try {
    for (const i of await api.lookupIssues(keys)) ctx.issues[i.key] = i;
  } catch (e) {
    ctx.log("warn", msg().enrich.lookupFailed(String(e)));
  }
}

function perTask(ws: JiraWorklog[]): { minutes: Record<string, number>; notes: Record<string, string[]> } {
  const out = { minutes: {} as Record<string, number>, notes: {} as Record<string, string[]> };
  for (const w of ws) {
    out.minutes[w.key] = (out.minutes[w.key] ?? 0) + mins(w);
    const c = w.comment.trim();
    const n = (out.notes[w.key] ??= []);
    if (c && !n.includes(c)) n.push(c);
  }
  return out;
}

/** Activity of a filled day, so gap fillers can borrow from it like from any analysed day. */
export function tempoActivity(ws: JiraWorklog[]): DayActivity {
  const p = perTask(ws);
  return { weights: p.minutes, notes: p.notes, summary: "", reasoning: msg().tempo.reasoning, evidence: [], eventCount: 0 };
}

/** The day exactly as logged in Tempo: hours and descriptions are not redistributed. */
export function tempoDay(base: DayPlan, ws: JiraWorklog[], ctx: RunContext): DayPlan {
  const p = perTask(ws);
  const tasks = Object.entries(p.minutes)
    .sort((a, b) => b[1] - a[1])
    .map(([key, m]) => ({ key, hours: m / 60, notes: p.notes[key] ?? [] }));
  return { ...base, tasks, basis: "tempo", inferredFrom: undefined, summary: autoSummary(tasks, ctx.issues), reasoning: msg().tempo.reasoning };
}
