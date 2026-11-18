import type { DashIssue } from "../types";

/** Jira status categories, in board order. */
export type Category = "new" | "indeterminate" | "done";
export const CATEGORIES: Category[] = ["new", "indeterminate", "done"];

export const categoryOf = (i: DashIssue): Category => (CATEGORIES.includes(i.category as Category) ? (i.category as Category) : "new");

export const isOverdue = (i: DashIssue, today: string): boolean => categoryOf(i) !== "done" && !!i.due && i.due < today;

export interface DashFilter {
  project: string | null;
  query: string;
}

export function filterIssues(list: DashIssue[], f: DashFilter): DashIssue[] {
  const q = f.query.trim().toLowerCase();
  return list.filter(
    (i) => (!f.project || i.project === f.project) && (!q || i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)),
  );
}

export interface DashStats {
  open: number;
  inProgress: number;
  overdue: number;
  done: number;
}

export function dashStats(list: DashIssue[], today: string): DashStats {
  const s = { open: 0, inProgress: 0, overdue: 0, done: 0 };
  for (const i of list) {
    const c = categoryOf(i);
    if (c === "done") s.done++;
    else s.open++;
    if (c === "indeterminate") s.inProgress++;
    if (isOverdue(i, today)) s.overdue++;
  }
  return s;
}

export interface StatusGroup {
  status: string;
  issues: DashIssue[];
}

/** Board columns by category; inside, one group per exact status. Overdue first, then most recently updated. */
export function boardColumns(list: DashIssue[], today: string): Record<Category, StatusGroup[]> {
  const out: Record<Category, StatusGroup[]> = { new: [], indeterminate: [], done: [] };
  const order = (a: DashIssue, b: DashIssue) =>
    Number(isOverdue(b, today)) - Number(isOverdue(a, today)) || (b.updated ?? 0) - (a.updated ?? 0);
  for (const i of [...list].sort(order)) {
    const col = out[categoryOf(i)];
    const g = col.find((x) => x.status === i.status) ?? col[col.push({ status: i.status, issues: [] }) - 1];
    g.issues.push(i);
  }
  for (const c of CATEGORIES) out[c].sort((a, b) => b.issues.length - a.issues.length || a.status.localeCompare(b.status));
  return out;
}

export interface ProjectCount {
  key: string;
  name: string;
  count: number;
}

export function projectsOf(list: DashIssue[]): ProjectCount[] {
  const m = new Map<string, ProjectCount>();
  for (const i of list) {
    const p = m.get(i.project) ?? { key: i.project, name: i.projectName, count: 0 };
    p.count++;
    m.set(i.project, p);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
