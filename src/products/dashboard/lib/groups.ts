import type { DashIssue } from "@/shared/types";
import { containerOf } from "./containers";
import { flagsOf, PROFILE, stageOf, type Flag, type Profile, type Stage } from "./stages";

/** Swimlanes of the board: by epic (container), by release, or one lane. */
export type Grouping = "epic" | "release" | "none";
export const GROUPINGS: Grouping[] = ["epic", "release", "none"];

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

/** Board columns, left to right like Jira; review only when something is in review. */
export const COLUMNS: Stage[] = ["todo", "dev", "review", "test", "done"];
export const visibleColumns = (list: DashIssue[]): Stage[] => COLUMNS.filter((s) => s !== "review" || list.some((i) => stageOf(i) === "review"));

/** Done tasks older than this are tucked away inside the done column. */
export const RECENT_DONE_DAYS = 7;
export const isOldDone = (i: DashIssue, now: number): boolean =>
  stageOf(i) === "done" && !!i.resolved && now - i.resolved > RECENT_DONE_DAYS * 86_400_000;

export interface Lane {
  /** Container key or release name; null for "no epic" / "no release" / the single lane. */
  id: string | null;
  /** The container itself when known: summary, status, who is responsible. */
  head?: DashIssue;
  cells: Record<Stage, DashIssue[]>;
  total: number;
}

const emptyCells = (): Record<Stage, DashIssue[]> => ({ backlog: [], todo: [], dev: [], review: [], test: [], done: [] });

/** Lanes keep the order of their first (most important) task; the "none" lane goes last. */
export function lanes(sorted: DashIssue[], by: Grouping, byKey: Map<string, DashIssue>, types: Set<string>): Lane[] {
  const keysOf = (i: DashIssue): (string | null)[] =>
    by === "epic" ? [containerOf(i, byKey, types)] : by === "release" ? (i.fixVersions.length ? i.fixVersions : [null]) : [null];
  const m = new Map<string | null, Lane>();
  for (const i of sorted) {
    for (const k of keysOf(i)) {
      const lane = m.get(k) ?? { id: k, head: k && by === "epic" ? byKey.get(k) : undefined, cells: emptyCells(), total: 0 };
      lane.cells[stageOf(i)].push(i);
      lane.total++;
      m.set(k, lane);
    }
  }
  const all = [...m.values()];
  return [...all.filter((l) => l.id !== null), ...all.filter((l) => l.id === null)];
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
