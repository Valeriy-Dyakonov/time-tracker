import type { DashIssue } from "@/shared/types";
import { containerOf } from "./containers";
import { flagsOf, PROFILE, stageOf, type Flag, type Profile, type Stage } from "./stages";

export interface DashFilter {
  profile: Profile;
  project: string | null;
  query: string;
  /** Narrowed from a stat tile. */
  stage: Stage | null;
  flag: Flag | null;
  /** QA and lead can still look at their own tasks only. */
  onlyMine: boolean;
}

export function filterIssues(list: DashIssue[], f: DashFilter, today: string, now: number): DashIssue[] {
  const q = f.query.trim().toLowerCase();
  const mineOnly = PROFILE[f.profile].mineOnly || f.onlyMine;
  return list.filter(
    (i) =>
      (!mineOnly || i.mine) &&
      (!f.project || i.project === f.project) &&
      (!q || i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)) &&
      (!f.stage || stageOf(i) === f.stage) &&
      (!f.flag || flagsOf(i, today, now).includes(f.flag)),
  );
}

/** Stage order of the role first, then flagged tasks, then the most recently changed: lanes follow what matters to the role. */
export function sortForProfile(list: DashIssue[], profile: Profile, today: string, now: number): DashIssue[] {
  const rank = (i: DashIssue) => PROFILE[profile].order.indexOf(stageOf(i));
  return [...list].sort(
    (a, b) => rank(a) - rank(b) || flagsOf(b, today, now).length - flagsOf(a, today, now).length || (b.updated ?? 0) - (a.updated ?? 0),
  );
}

/** Board columns left to right like Jira; review and approval/merge only when something is there. Done lives in the history. */
const COLUMNS: Stage[] = ["todo", "dev", "review", "test", "ship"];
const OPTIONAL: Stage[] = ["review", "ship"];
export const visibleColumns = (list: DashIssue[]): Stage[] =>
  COLUMNS.filter((s) => !OPTIONAL.includes(s) || list.some((i) => stageOf(i) === s));

/** Tasks of one epic inside a column: the epic is drawn once, its tasks nested under it. */
export interface EpicBlock {
  /** Container key; null for tasks without an epic. */
  id: string | null;
  head?: DashIssue;
  issues: DashIssue[];
}

/** One column's tasks in blocks by epic; blocks keep the order of their most important task, loose tasks last. */
export function epicBlocks(sorted: DashIssue[], byKey: Map<string, DashIssue>, types: Set<string>): EpicBlock[] {
  const m = new Map<string | null, EpicBlock>();
  for (const i of sorted) {
    const id = containerOf(i, byKey, types);
    const b = m.get(id) ?? { id, head: id ? byKey.get(id) : undefined, issues: [] };
    b.issues.push(i);
    m.set(id, b);
  }
  const all = [...m.values()];
  return [...all.filter((b) => b.id !== null), ...all.filter((b) => b.id === null)];
}

export function byColumn(sorted: DashIssue[], columns: Stage[]): Record<string, DashIssue[]> {
  const out: Record<string, DashIssue[]> = Object.fromEntries(columns.map((c) => [c, []]));
  for (const i of sorted) out[stageOf(i)]?.push(i);
  return out;
}

/** Folded stages (backlog) are kept apart from the board. */
export function splitFolded(list: DashIssue[], profile: Profile): { main: DashIssue[]; folded: DashIssue[] } {
  const folded = PROFILE[profile].folded;
  return { main: list.filter((i) => !folded.includes(stageOf(i))), folded: list.filter((i) => folded.includes(stageOf(i))) };
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
