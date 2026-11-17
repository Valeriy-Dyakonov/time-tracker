import type { Analysis, DayPlan } from "../types";
import { dateShort, t } from "../i18n";
import { dayTotal } from "./allocate";
import { fmtH, fmtMinutes, meetingMinutes, type Week } from "./report";

/** Tempo accepts both "2h 30m" and decimal "2.5". */
export type HoursFormat = "hm" | "decimal";

export function fmtTempo(hours: number, f: HoursFormat): string {
  if (f === "decimal") return String(Math.round(hours * 100) / 100);
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export interface WorklogRow {
  key: string;
  date: string;
  hours: number;
  comment: string;
  /** Day without own data: hours and description are estimates. */
  inferred: boolean;
}

/** Text for the Tempo "description" field: what was done on this task this day. */
export function worklogComment(a: Analysis, d: DayPlan, key: string): string {
  const note = d.tasks.find((t) => t.key === key)?.notes[0]?.trim();
  if (note) return note;
  if (d.basis === "activity" && d.summary) return d.summary;
  return a.issues[key]?.summary ?? "";
}

/** One row per (day, task) with hours > 0, working days only. */
export function worklogRows(a: Analysis): WorklogRow[] {
  const rows: WorklogRow[] = [];
  for (const d of a.days) {
    if (d.off) continue;
    for (const t of d.tasks) {
      if (t.hours > 0) rows.push({ key: t.key, date: d.date, hours: t.hours, comment: worklogComment(a, d, t.key), inferred: d.basis !== "activity" });
    }
  }
  return rows;
}

export const rowId = (r: { key: string; date: string }) => `${r.key}|${r.date}`;

/** Ready-to-paste text for the weekly field of the second system (editable in the UI). */
export function weekText(a: Analysis, w: Week): string {
  const days = w.days.filter((d) => !d.off);
  const perTask = new Map<string, { hours: number; said: string[] }>();
  for (const d of days) {
    for (const t of d.tasks) {
      const cur = perTask.get(t.key) ?? { hours: 0, said: [] };
      cur.hours += t.hours;
      const c = worklogComment(a, d, t.key);
      if (c && !cur.said.includes(c)) cur.said.push(c);
      perTask.set(t.key, cur);
    }
  }
  const lines = [...perTask.entries()]
    .sort((x, y) => y[1].hours - x[1].hours)
    .map(([key, v]) => {
      const title = a.issues[key]?.summary ?? "";
      const said = v.said.filter((s) => s !== title).slice(0, 2).join("; ");
      return t().analysis.submit.line(key, title, fmtH(v.hours), said);
    });
  const mm = days.reduce((s, d) => s + meetingMinutes(d), 0);
  if (mm > 0) lines.push(t().analysis.submit.meetings(fmtMinutes(mm)));
  return lines.join("\n");
}

export const weekTitle = (w: Week): string => `${dateShort(w.monday)} – ${dateShort(w.sunday)}`;
export const weekHours = (w: Week): number => w.days.reduce((s, d) => s + (d.off ? 0 : dayTotal(d)), 0);

/** System prompt for rewriting a week as prose, in the current language. */
export const weekSystemPrompt = (): string => t().analysis.prompt.week;

export function weekPrompt(a: Analysis, w: Week): string {
  return JSON.stringify({
    week: weekTitle(w),
    tasks: weekText(a, w),
    days: w.days.filter((d) => !d.off && d.basis === "activity").map((d) => ({ date: d.date, summary: d.summary, reasoning: d.reasoning })),
  });
}
