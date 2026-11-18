import { rowId, type WorklogRow } from "./submit";

/** The user's changes to the plan in the "Списание" tab, kept per period. */
export interface RowEdits {
  /** rowId -> hours set by hand. */
  hours: Record<string, number>;
  /** rowIds of plan rows the user removed. */
  removed: Record<string, true>;
  /** Rows the user added; their hours can be edited like any other. */
  added: WorklogRow[];
}

export const NO_EDITS: RowEdits = { hours: {}, removed: {}, added: [] };

export interface EditedRow extends WorklogRow {
  origin: "plan" | "added";
  /** Hours from the analysis when the user changed them. */
  planHours?: number;
}

const MAX_HOURS = 24;

/** The plan as the user sees and submits it: removed rows dropped, hours overridden, added rows appended. */
export function applyEdits(rows: WorklogRow[], e: RowEdits): EditedRow[] {
  const out: EditedRow[] = [];
  for (const r of rows) {
    const id = rowId(r);
    if (e.removed[id]) continue;
    const h = e.hours[id];
    out.push(h !== undefined && h !== r.hours ? { ...r, hours: h, origin: "plan", planHours: r.hours } : { ...r, origin: "plan" });
  }
  const taken = new Set(out.map(rowId));
  for (const r of e.added) {
    if (taken.has(rowId(r))) continue;
    out.push({ ...r, hours: e.hours[rowId(r)] ?? r.hours, origin: "added" });
  }
  return out;
}

/** Hours typed by hand: "2h 30m", "2ч 30м", "2.5", "2,5", "2:30", "90m". null when not understood or out of range. */
export function parseHours(text: string): number | null {
  const s = text.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let h: number | null = null;
  const colon = s.match(/^(\d{1,2}):(\d{2})$/);
  const units = s.match(/^(?:(\d+(?:\.\d+)?)\s*[hч])?\s*(?:(\d+)\s*(?:m|м|мин))?$/);
  if (colon) h = Number(colon[1]) + Number(colon[2]) / 60;
  else if (/^\d+(\.\d+)?$/.test(s)) h = Number(s);
  else if (units && (units[1] || units[2])) h = Number(units[1] ?? 0) + Number(units[2] ?? 0) / 60;
  if (h === null || !Number.isFinite(h) || h <= 0 || h > MAX_HOURS) return null;
  return Math.round(h * 60) / 60;
}

export const isIssueKey = (s: string): boolean => /^[A-Z][A-Z0-9_]*-\d+$/.test(s);

export type AddError = "key" | "date" | "hours" | "exists";

/** Validates a row to add; the period bounds are inclusive local dates. */
export function checkNewRow(r: { key: string; date: string; hours: number | null }, start: string, end: string, current: WorklogRow[]): AddError | null {
  if (!isIssueKey(r.key)) return "key";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date < start || r.date > end) return "date";
  if (r.hours === null) return "hours";
  if (current.some((x) => rowId(x) === rowId(r))) return "exists";
  return null;
}

/** Removing an added row forgets it; removing a plan row hides it until restored. */
export function removeRow(e: RowEdits, r: EditedRow): RowEdits {
  const id = rowId(r);
  const { [id]: _, ...hours } = e.hours;
  if (r.origin === "added") return { ...e, hours, added: e.added.filter((x) => rowId(x) !== id) };
  return { ...e, hours, removed: { ...e.removed, [id]: true } };
}

export function restoreRow(e: RowEdits, id: string): RowEdits {
  const { [id]: _, ...removed } = e.removed;
  return { ...e, removed };
}

export function setHours(e: RowEdits, r: EditedRow, hours: number): RowEdits {
  const id = rowId(r);
  const base = r.origin === "plan" ? (r.planHours ?? r.hours) : undefined;
  if (base !== undefined && hours === base) {
    const { [id]: _, ...rest } = e.hours;
    return { ...e, hours: rest };
  }
  return { ...e, hours: { ...e.hours, [id]: hours } };
}

export const editCount = (e: RowEdits): number => Object.keys(e.hours).length + Object.keys(e.removed).length + e.added.length;
