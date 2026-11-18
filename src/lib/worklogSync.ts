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
  state: "none" | "partial" | "full";
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
  return { entries, logged, planned, missing, state: logged === 0 ? "none" : missing > 0 ? "partial" : "full" };
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
