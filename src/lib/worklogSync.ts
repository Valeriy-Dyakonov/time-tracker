import type { JiraWorklog } from "../types";
import { rowId, type WorklogRow } from "./submit";

/** What Jira already has for a planned row (same task, same day, the user's own worklogs). */
export interface RowSync {
  entries: JiraWorklog[];
  /** Minutes already booked in Jira. */
  logged: number;
  /** Minutes planned by the analysis. */
  planned: number;
  /** Minutes an automatic submit would add: the difference, never a replacement. */
  missing: number;
  /** full: exactly the plan; over: Jira has more than planned. */
  state: "none" | "partial" | "full" | "over";
}

/** Jira stores seconds, Tempo works in minutes: compare in whole minutes so 2.33 h does not look "partial". */
export const minutes = (hours: number): number => Math.round(hours * 60);

export function indexWorklogs(list: JiraWorklog[]): Map<string, JiraWorklog[]> {
  const m = new Map<string, JiraWorklog[]>();
  for (const w of list) {
    const id = rowId(w);
    m.set(id, [...(m.get(id) ?? []), w]);
  }
  return m;
}

export function rowSync(row: WorklogRow, entries: JiraWorklog[] = []): RowSync {
  const logged = Math.round(entries.reduce((s, w) => s + w.seconds, 0) / 60);
  const planned = minutes(row.hours);
  const missing = Math.max(0, planned - logged);
  const state = logged === 0 ? "none" : missing > 0 ? "partial" : logged > planned ? "over" : "full";
  return { entries, logged, planned, missing, state };
}

/** Planned and logged minutes of one day; logged counts every worklog of the user that day, planned or not. */
export interface DayMatch {
  planned: number;
  logged: number;
}

export function dayMatches(rows: WorklogRow[], list: JiraWorklog[]): Map<string, DayMatch> {
  const m = new Map<string, DayMatch>();
  const at = (date: string) => m.get(date) ?? m.set(date, { planned: 0, logged: 0 }).get(date)!;
  for (const r of rows) at(r.date).planned += minutes(r.hours);
  for (const w of list) at(w.date).logged += Math.round(w.seconds / 60);
  return m;
}

/** Days where Jira and the plan disagree, sorted by date. */
export const mismatchedDays = (days: Map<string, DayMatch>): string[] =>
  [...days.entries()].filter(([, d]) => d.logged !== d.planned).map(([date]) => date).sort();

/** Worklogs on a task/day the plan does not have: the usual reason why totals differ. */
export function unplanned(rows: WorklogRow[], list: JiraWorklog[]): JiraWorklog[] {
  const planned = new Set(rows.map(rowId));
  return list.filter((w) => !planned.has(rowId(w))).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

export interface PlannedWrite {
  row: WorklogRow;
  minutes: number;
  comment: string;
  /** Jira already has part of the time: only the difference is written. */
  topUp: boolean;
}

/** Rows "submit all" would write: only the missing minutes; rows already filled in Jira are skipped. */
export function bulkPlan(rows: WorklogRow[], index: Map<string, JiraWorklog[]>, comment: (r: WorklogRow) => string): PlannedWrite[] {
  return rows.flatMap((row) => {
    const s = rowSync(row, index.get(rowId(row)));
    return s.missing > 0 ? [{ row, minutes: s.missing, comment: comment(row), topUp: s.logged > 0 }] : [];
  });
}
