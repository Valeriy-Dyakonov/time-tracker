import type { DashIssue } from "@/shared/types";
import { flagsOf, PROFILE, stageOf, type Flag, type Profile, type Stage } from "./stages";

export type Grouping = "epic" | "release" | "stage";
export const GROUPINGS: Grouping[] = ["epic", "release", "stage"];

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

/** Stage order of the role first, then flagged tasks, then the most recently changed. */
export function sortForProfile(list: DashIssue[], profile: Profile, today: string, now: number): DashIssue[] {
  const rank = (i: DashIssue) => PROFILE[profile].order.indexOf(stageOf(i));
  return [...list].sort(
    (a, b) => rank(a) - rank(b) || flagsOf(b, today, now).length - flagsOf(a, today, now).length || (b.updated ?? 0) - (a.updated ?? 0),
  );
}

export interface Group {
  /** Epic/parent key, release name or stage; null for "no epic" / "no release". */
  id: string | null;
  /** The epic or parent itself when known: summary, status, who is responsible. */
  head?: DashIssue;
  issues: DashIssue[];
}

/** The epic of a task, also through its parent (a subtask of a story in an epic). */
export function epicOf(i: DashIssue, byKey: Map<string, DashIssue>): string | null {
  if (i.epic) return i.epic;
  const p = i.parent ? byKey.get(i.parent) : undefined;
  if (p?.epic) return p.epic;
  return p && p.issueType.toLowerCase() === "epic" ? p.key : (i.parent ?? null);
}

function collect(list: DashIssue[], keysOf: (i: DashIssue) => (string | null)[]): Map<string | null, DashIssue[]> {
  const m = new Map<string | null, DashIssue[]>();
  for (const i of list) for (const k of keysOf(i)) m.set(k, [...(m.get(k) ?? []), i]);
  return m;
}

/** Groups keep the order of their first (most important) task; the "none" group goes last. */
function ordered(m: Map<string | null, DashIssue[]>, head?: (id: string) => DashIssue | undefined): Group[] {
  const groups = [...m.entries()].filter(([id]) => id !== null).map(([id, issues]) => ({ id, head: head?.(id!), issues }));
  const none = m.get(null);
  return none ? [...groups, { id: null, issues: none }] : groups;
}

export function groupIssues(sorted: DashIssue[], by: Grouping, context: DashIssue[], profile: Profile): Group[] {
  const byKey = new Map([...context, ...sorted].map((i) => [i.key, i]));
  if (by === "epic") return ordered(collect(sorted, (i) => [epicOf(i, byKey)]), (id) => byKey.get(id));
  if (by === "release") return ordered(collect(sorted, (i) => (i.fixVersions.length ? i.fixVersions : [null])));
  const m = collect(sorted, (i) => [stageOf(i)]);
  return PROFILE[profile].order.filter((s) => m.has(s)).map((s) => ({ id: s, issues: m.get(s)! }));
}

/** Folded stages (backlog) are kept apart from the groups. */
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
