import type { Analysis, DayPlan, IssueInfo, Meeting } from "../types";
import { dateShort, hours as fmtHours, t } from "../i18n";
import { addDays, formatDate, mondayOf, weekdayName } from "./dates";
import { dayTotal } from "./allocate";

const msg = () => t().analysis;

/** Hours for display and copied text: "7,5" in Russian, "7.5" in English. */
export const fmtH = (h: number): string => fmtHours(h);

const hhmm = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getHours() < 10 ? "0" : ""}${d.getHours()}:${d.getMinutes() < 10 ? "0" : ""}${d.getMinutes()}`;
};

export const meetingRange = (m: Meeting): string => `${hhmm(m.ts)}–${hhmm(m.endTs)}`;

export function fmtMinutes(min: number): string {
  const u = msg().units;
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? u.hm(h, m) : `${h} ${u.h}`) : `${m} ${u.min}`;
}

export const meetingMinutes = (d: DayPlan): number => d.meetings.reduce((s, m) => s + m.minutes, 0);

/** "10:00–10:30 Daily; 14:00–15:00 Созвон" — for CSV / copy. */
export function meetingsText(d: DayPlan): string {
  return d.meetings.map((m) => `${meetingRange(m)} ${m.title}${m.isCall ? msg().report.call : ""}`).join("; ");
}

export interface Week {
  monday: string;
  sunday: string;
  days: DayPlan[];
  total: number;
}

export function weeksOf(days: DayPlan[]): Week[] {
  const map = new Map<string, DayPlan[]>();
  for (const d of days) {
    const m = mondayOf(d.date);
    map.set(m, [...(map.get(m) ?? []), d]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monday, ds]) => ({
      monday,
      sunday: addDays(monday, 6),
      days: ds,
      total: ds.reduce((s, d) => s + dayTotal(d), 0),
    }));
}

export interface TaskTotal {
  key: string;
  summary: string;
  hours: number;
  days: number;
}

export function totalsOf(days: DayPlan[], issues: Record<string, IssueInfo>): TaskTotal[] {
  const m = new Map<string, TaskTotal>();
  for (const d of days) {
    if (d.off) continue;
    for (const t of d.tasks) {
      const cur = m.get(t.key) ?? { key: t.key, summary: issues[t.key]?.summary ?? "", hours: 0, days: 0 };
      cur.hours += t.hours;
      cur.days += 1;
      m.set(t.key, cur);
    }
  }
  return [...m.values()].sort((x, y) => y.hours - x.hours);
}

export const totalsByTask = (a: Analysis): TaskTotal[] => totalsOf(a.days, a.issues);

/** Plain-text period summary used when AI is off or fails. */
export function templateNarrative(
  start: string,
  end: string,
  days: DayPlan[],
  issues: Record<string, IssueInfo>,
): string {
  const r = msg().report;
  const totals = totalsOf(days, issues);
  const hours = days.reduce((s, d) => s + dayTotal(d), 0);
  if (totals.length === 0) return r.narrativeNoData(formatDate(start), formatDate(end));
  const top = totals.slice(0, 3).map((x) => r.narrativeTop(x.key, x.summary, fmtH(x.hours), x.days)).join("; ");
  const inferred = days.filter((d) => d.basis === "inferred").map((d) => dateShort(d.date)).join(", ");
  return r.narrative(formatDate(start), formatDate(end), fmtH(hours), totals.length, days.length, top, inferred);
}

export function grandTotal(a: Analysis): number {
  return a.days.reduce((s, d) => s + dayTotal(d), 0);
}

export function targetTotal(a: Analysis): number {
  return a.days.filter((d) => !d.off).reduce((s, d) => s + d.target, 0);
}

const csvCell = (s: string | number): string => {
  const t = String(s);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** One row per (day, task) – for Jira worklogs. `;` + BOM so Excel opens it properly. */
export function tasksCsv(a: Analysis): string {
  const link = (k: string) => (a.jiraUrl ? `${a.jiraUrl}/browse/${k}` : "");
  const rows = [[...msg().report.csvTasks]];
  for (const d of a.days) {
    if (d.off) continue;
    for (const t of d.tasks)
      rows.push([d.date, t.key, a.issues[t.key]?.summary ?? "", fmtH(t.hours), t.notes.join(" | "), link(t.key)]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

/** One row per day – for the day-based system. */
export function daysCsv(a: Analysis): string {
  const rows = [[...msg().report.csvDays]];
  for (const d of a.days)
    rows.push([d.date, fmtH(dayTotal(d)), d.off ? msg().report.dayOff : d.summary, meetingsText(d)]);
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

const mdKey = (a: Analysis, k: string): string => (a.jiraUrl ? `[${k}](${a.jiraUrl}/browse/${k})` : k);

export function markdown(a: Analysis): string {
  const md = msg().report.md;
  const L: string[] = [];
  L.push(md.title(formatDate(a.start), formatDate(a.end)), "");
  L.push(md.total(fmtH(grandTotal(a)), fmtH(targetTotal(a))), "");
  L.push(md.byTask, "", md.tableHead, "|---|---|---:|---:|");
  for (const x of totalsByTask(a)) L.push(`| ${mdKey(a, x.key)} | ${x.summary} | ${fmtH(x.hours)} | ${x.days} |`);
  L.push("", md.byWeek, "");
  for (const w of weeksOf(a.days)) {
    L.push(md.week(formatDate(w.monday), formatDate(w.sunday), fmtH(w.total)), "");
    for (const d of w.days) {
      L.push(md.day(weekdayName(d.date), formatDate(d.date), fmtH(dayTotal(d)), d.off));
      for (const x of d.tasks) L.push(md.task(mdKey(a, x.key), a.issues[x.key]?.summary ?? "", fmtH(x.hours)));
      if (d.meetings.length) L.push(md.meetings(fmtMinutes(meetingMinutes(d)), meetingsText(d)));
    }
    L.push("");
  }
  return L.join("\n");
}

export function dayText(a: Analysis, d: DayPlan): string {
  const r = msg().report;
  return [
    r.dayTextHead(formatDate(d.date), fmtH(dayTotal(d))),
    ...d.tasks.map((x) => r.dayTextTask(x.key, a.issues[x.key]?.summary ?? "", fmtH(x.hours), a.jiraUrl ? `${a.jiraUrl}/browse/${x.key}` : "")),
    ...(d.meetings.length ? [r.dayTextMeetings(fmtMinutes(meetingMinutes(d)), meetingsText(d))] : []),
    ...(d.summary ? [d.summary] : []),
  ].join("\n");
}
