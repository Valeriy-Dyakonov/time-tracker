import type { Analysis, JiraWorklog } from "../types";
import { t } from "../i18n";
import { formatDate } from "./dates";
import { fmtH, type Week } from "./report";
import { minutes } from "./worklogSync";

/** The week as it ended up in Tempo: the source for the user's own system once Tempo is filled. */

const inWeek = (w: Week, list: JiraWorklog[]) => list.filter((x) => x.date >= w.monday && x.date <= w.sunday);
const mins = (x: JiraWorklog) => Math.round(x.seconds / 60);

export interface TempoReadiness {
  ready: boolean;
  logged: number;
  /** Sum of the working days' norms of the week, minutes. */
  norm: number;
}

/** Ready when every working day of the week has at least its norm logged in Tempo. */
export function tempoReadiness(w: Week, list: JiraWorklog[]): TempoReadiness {
  const ws = inWeek(w, list);
  const work = w.days.filter((d) => !d.off);
  const perDay = new Map<string, number>();
  for (const x of ws) perDay.set(x.date, (perDay.get(x.date) ?? 0) + mins(x));
  const norm = work.reduce((s, d) => s + minutes(d.target), 0);
  const logged = ws.reduce((s, x) => s + mins(x), 0);
  const ready = work.length > 0 && work.every((d) => (perDay.get(d.date) ?? 0) >= minutes(d.target));
  return { ready, logged, norm };
}

export interface TempoTask {
  key: string;
  minutes: number;
  /** Distinct worklog descriptions, in date order. */
  said: string[];
}

export function tempoWeekTasks(w: Week, list: JiraWorklog[]): TempoTask[] {
  const by = new Map<string, TempoTask>();
  for (const x of [...inWeek(w, list)].sort((a, b) => a.date.localeCompare(b.date))) {
    const cur = by.get(x.key) ?? { key: x.key, minutes: 0, said: [] };
    cur.minutes += mins(x);
    const c = x.comment.trim();
    if (c && !cur.said.includes(c)) cur.said.push(c);
    by.set(x.key, cur);
  }
  return [...by.values()].sort((a, b) => b.minutes - a.minutes || a.key.localeCompare(b.key));
}

/** Same layout as the plan-based weekly text, built from Tempo worklogs. */
export function tempoWeekText(a: Analysis, w: Week, list: JiraWorklog[]): string {
  return tempoWeekTasks(w, list)
    .map((x) => {
      const title = a.issues[x.key]?.summary ?? "";
      const said = x.said.filter((s) => s !== title).slice(0, 2).join("; ");
      return t().analysis.submit.line(x.key, title, fmtH(x.minutes / 60), said);
    })
    .join("\n");
}

/** Date and hours per day as logged in Tempo, one line per day that has worklogs. */
export function tempoDayHours(w: Week, list: JiraWorklog[]): string {
  const perDay = new Map<string, number>();
  for (const x of inWeek(w, list)) perDay.set(x.date, (perDay.get(x.date) ?? 0) + mins(x));
  return [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, m]) => `${formatDate(d)}\t${fmtH(m / 60)}`).join("\n");
}
