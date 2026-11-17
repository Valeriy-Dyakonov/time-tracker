import type { Analysis, DayPlan, IssueInfo, Meeting } from "../types";
import { addDays, formatRu, mondayOf, weekdayName } from "./dates";
import { dayTotal } from "./allocate";

export const fmtH = (h: number): string =>
  (Math.round(h * 100) / 100).toString().replace(".", ",");

const hhmm = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getHours() < 10 ? "0" : ""}${d.getHours()}:${d.getMinutes() < 10 ? "0" : ""}${d.getMinutes()}`;
};

export const meetingRange = (m: Meeting): string => `${hhmm(m.ts)}–${hhmm(m.endTs)}`;

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`;
}

export const meetingMinutes = (d: DayPlan): number => d.meetings.reduce((s, m) => s + m.minutes, 0);

/** "10:00–10:30 Daily; 14:00–15:00 Созвон" — for CSV / copy. */
export function meetingsText(d: DayPlan): string {
  return d.meetings.map((m) => `${meetingRange(m)} ${m.title}${m.isCall ? " (звонок)" : ""}`).join("; ");
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
  const totals = totalsOf(days, issues);
  const hours = days.reduce((s, d) => s + dayTotal(d), 0);
  if (totals.length === 0) return `За период ${formatRu(start)} – ${formatRu(end)} не удалось распределить часы: нет данных.`;
  const top = totals
    .slice(0, 3)
    .map((t) => `${t.key}${t.summary ? " «" + t.summary + "»" : ""} — ${fmtH(t.hours)} ч (${t.days} дн.)`)
    .join("; ");
  const inferred = days.filter((d) => d.basis === "inferred").map((d) => formatRu(d.date).slice(0, 5));
  return (
    `За период ${formatRu(start)} – ${formatRu(end)} распределено ${fmtH(hours)} ч по ${totals.length} задачам, рабочих дней: ${days.length}. ` +
    `Больше всего времени: ${top}.` +
    (inferred.length ? ` Дни без данных (${inferred.join(", ")}) заполнены по соседним дням или по всему периоду — проверьте их.` : "")
  );
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
  const rows = [["Дата", "Задача", "Название", "Часы", "Заметки", "Ссылка"]];
  for (const d of a.days) {
    if (d.off) continue;
    for (const t of d.tasks)
      rows.push([d.date, t.key, a.issues[t.key]?.summary ?? "", fmtH(t.hours), t.notes.join(" | "), link(t.key)]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

/** One row per day – for the day-based system. */
export function daysCsv(a: Analysis): string {
  const rows = [["Дата", "Часы", "Описание", "Звонки и встречи"]];
  for (const d of a.days)
    rows.push([d.date, fmtH(dayTotal(d)), d.off ? "Выходной/отпуск" : d.summary, meetingsText(d)]);
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

const mdKey = (a: Analysis, k: string): string => (a.jiraUrl ? `[${k}](${a.jiraUrl}/browse/${k})` : k);

export function markdown(a: Analysis): string {
  const L: string[] = [];
  L.push(`# Отчёт по времени ${formatRu(a.start)} – ${formatRu(a.end)}`, "");
  L.push(`Всего: **${fmtH(grandTotal(a))} ч** из ${fmtH(targetTotal(a))} ч`, "");
  L.push("## По задачам", "", "| Задача | Название | Часы | Дней |", "|---|---|---:|---:|");
  for (const t of totalsByTask(a)) L.push(`| ${mdKey(a, t.key)} | ${t.summary} | ${fmtH(t.hours)} | ${t.days} |`);
  L.push("", "## По неделям", "");
  for (const w of weeksOf(a.days)) {
    L.push(`### ${formatRu(w.monday)} – ${formatRu(w.sunday)}: ${fmtH(w.total)} ч`, "");
    for (const d of w.days) {
      L.push(`- **${weekdayName(d.date)} ${formatRu(d.date)}** — ${fmtH(dayTotal(d))} ч${d.off ? " (выходной)" : ""}`);
      for (const t of d.tasks)
        L.push(`  - ${mdKey(a, t.key)} ${a.issues[t.key]?.summary ?? ""}: ${fmtH(t.hours)} ч`);
      if (d.meetings.length) L.push(`  - 📞 Звонки и встречи (${fmtMinutes(meetingMinutes(d))}): ${meetingsText(d)}`);
    }
    L.push("");
  }
  return L.join("\n");
}

/** Plain text for pasting a single day into the other system. */
export function dayText(a: Analysis, d: DayPlan): string {
  return `${formatRu(d.date)} — ${fmtH(dayTotal(d))} ч\n` +
    d.tasks.map((t) => `${t.key} ${a.issues[t.key]?.summary ?? ""}: ${fmtH(t.hours)} ч${a.jiraUrl ? " " + a.jiraUrl + "/browse/" + t.key : ""}`).join("\n") +
    (d.meetings.length ? `\nЗвонки и встречи (${fmtMinutes(meetingMinutes(d))}): ${meetingsText(d)}` : "") +
    (d.summary ? `\n${d.summary}` : "");
}
