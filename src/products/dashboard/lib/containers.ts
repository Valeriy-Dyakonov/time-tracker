import type { DashIssue } from "@/shared/types";

/**
 * "Epic" in the broad sense: the task a group of tasks belongs to. Installations use Epic Link, a parent,
 * or a plain link ("relates") to an issue of some container type (epic, release, feature...). Which types are
 * containers is the user's choice; by default they are guessed from the type name.
 */

const AUTO = ["epic", "эпик", "release", "релиз", "feature", "фича", "фичи", "initiative", "инициатив"];
export const looksLikeContainer = (type: string): boolean => AUTO.some((w) => type.toLowerCase().includes(w));

export interface ContainerType {
  type: string;
  /** Tasks on the dashboard linked to (or under) an issue of this type. */
  count: number;
  auto: boolean;
}

/** Types seen as parents and link targets of the loaded tasks, most used first. */
export function containerCandidates(issues: DashIssue[], context: Map<string, DashIssue>): ContainerType[] {
  const counts = new Map<string, Set<string>>();
  const add = (type: string, task: string) => {
    if (type) counts.set(type, (counts.get(type) ?? new Set()).add(task));
  };
  for (const i of issues) {
    for (const l of i.links) add(l.issueType, i.key);
    const p = i.parent ? context.get(i.parent) : undefined;
    if (p) add(p.issueType, i.key);
    const e = i.epic ? context.get(i.epic) : undefined;
    if (e) add(e.issueType, i.key);
  }
  return [...counts.entries()]
    .map(([type, s]) => ({ type, count: s.size, auto: looksLikeContainer(type) }))
    .sort((a, b) => Number(b.auto) - Number(a.auto) || b.count - a.count || a.type.localeCompare(b.type));
}

/** The user's choice, or the guessed types when there is none. */
export function containerTypes(chosen: string[] | null, candidates: ContainerType[]): Set<string> {
  return new Set((chosen ?? candidates.filter((c) => c.auto).map((c) => c.type)).map((t) => t.toLowerCase()));
}

/**
 * Epic Link first, then a container parent, then a linked container, then the parent's container
 * (a subtask of a story in a release). A plain parent is the last resort, so subtasks stay with their story.
 */
export function containerOf(i: DashIssue, byKey: Map<string, DashIssue>, types: Set<string>, depth = 0): string | null {
  if (i.epic) return i.epic;
  const is = (type: string) => types.has(type.toLowerCase());
  const p = i.parent ? byKey.get(i.parent) : undefined;
  if (p && is(p.issueType)) return p.key;
  const link = i.links.find((l) => is(l.issueType));
  if (link) return link.key;
  if (p && depth < 2) return containerOf(p, byKey, types, depth + 1) ?? p.key;
  return i.parent;
}
