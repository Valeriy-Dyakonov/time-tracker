import type { Mr, MrBoard, MrTask, Roster } from "@/shared/types";

export type SectionId = "review" | "mine" | "team";
export type Filter = "all" | "waiting" | "threads" | "ready";
export const FILTERS: Filter[] = ["all", "waiting", "threads", "ready"];
export const SECTIONS: SectionId[] = ["review", "mine", "team"];

/** What an MR is waiting for, from what GitLab told us. */
export interface Facts {
  /** Needs approvals (a draft does not yet). */
  waiting: boolean;
  /** Has unresolved discussion threads. */
  threads: boolean;
  /** GitLab says it can be merged. */
  ready: boolean;
}

export function factsOf(mr: Mr): Facts {
  const waiting = !mr.draft && (mr.approvalsLeft !== null ? mr.approvalsLeft > 0 : mr.approvedBy.length === 0);
  return { waiting, threads: !mr.discussionsResolved, ready: !mr.draft && mr.mergeStatus === "mergeable" };
}

const passes = (mr: Mr, f: Filter): boolean => {
  if (f === "all") return true;
  const facts = factsOf(mr);
  return f === "waiting" ? facts.waiting : f === "threads" ? facts.threads : facts.ready;
};

/** GitLab usernames whose MRs a developer reviews without being asked: the team's developers and its lead. */
export interface ReviewPool {
  devs: Set<string>;
  leads: Set<string>;
}

/** The main line: an MR into it is not the developer profile's to review, whoever wrote it. */
const MAIN_LINE = /^(master|main)$/i;

/**
 * Which MRs the user is asked to review and has not approved yet: those that name the user as reviewer and,
 * with a `pool` (developer profile), also those of the team's developers and of the lead, except MRs into master.
 */
export const needsMyReview = (mr: Mr, me: string, pool?: ReviewPool | null): boolean => {
  if (mr.draft || mr.author.username === me || mr.approvedBy.some((a) => a.username === me)) return false;
  if (mr.reviewers.some((r) => r.username === me)) return true;
  const who = mr.author.username;
  return !!pool && !MAIN_LINE.test(mr.targetBranch) && (pool.devs.has(who) || pool.leads.has(who));
};

export interface Section {
  id: SectionId;
  mrs: Mr[];
}

/** Splits the board: waiting for my review, my own, and the team's that I am not asked to review. Newest change first. */
export function buildSections(board: MrBoard, team: string[], filter: Filter, pool?: ReviewPool | null): Section[] {
  const me = board.me.username;
  const people = new Set(team);
  const review = board.mrs.filter((m) => needsMyReview(m, me, pool));
  const taken = new Set(review);
  const sections: Record<SectionId, Mr[]> = {
    review,
    mine: board.mrs.filter((m) => m.author.username === me),
    team: board.mrs.filter((m) => !taken.has(m) && m.author.username !== me && people.has(m.author.username)),
  };
  return SECTIONS.map((id) => ({ id, mrs: sections[id].filter((m) => passes(m, filter)).sort((a, b) => b.updated - a.updated) }));
}

/** How many MRs each filter would show over all sections, for the counters on the chips. */
export function filterCounts(board: MrBoard, team: string[], pool?: ReviewPool | null): Record<Filter, number> {
  return Object.fromEntries(FILTERS.map((f) => [f, buildSections(board, team, f, pool).reduce((n, s) => n + s.mrs.length, 0)])) as Record<Filter, number>;
}

/** People of a team and its sub-teams (everyone when no team is chosen). */
function peopleOf(roster: Roster, teamId: number | null) {
  const inTeam = new Set<number>();
  if (teamId !== null) {
    inTeam.add(teamId);
    for (let grew = true; grew; ) {
      grew = false;
      for (const t of roster.teams) if (t.parentId !== null && inTeam.has(t.parentId) && !inTeam.has(t.id)) { inTeam.add(t.id); grew = true; }
    }
  }
  return roster.people.filter((p) => teamId === null || (p.teamId !== null && inTeam.has(p.teamId)));
}

const gitlabOf = (p: Roster["people"][number]) => p.accounts.filter((a) => a.system === "gitlab").map((a) => a.extId);

/** GitLab usernames of the people in a team and its sub-teams (all people when no team is chosen). */
export function teamUsernames(roster: Roster, teamId: number | null): string[] {
  return [...new Set(peopleOf(roster, teamId).flatMap(gitlabOf))];
}

/** Whose MRs a developer reviews: developers of the team, and its leads (not the ones into master). */
export function reviewPool(roster: Roster, teamId: number | null): ReviewPool {
  const people = peopleOf(roster, teamId);
  const names = (roles: string[]) => new Set(people.filter((p) => roles.includes(p.role)).flatMap(gitlabOf));
  return { devs: names(["dev"]), leads: names(["lead", "devLead"]) };
}

export type GroupBy = "none" | "release" | "task";
export const GROUPS: GroupBy[] = ["none", "release", "task"];

/** Nothing happened to an MR for this long: it is probably forgotten. */
export const STALE_DAYS = 14;
export const isStale = (mr: Mr, now: number): boolean => now - mr.updated > STALE_DAYS * 86_400_000;

/** A release branch name: used as the release when the task has no fix version. */
const RELEASE_BRANCH = /(^|\/)(release|rc|hotfix)\b|^v?\d+\.\d+/i;

export interface Bucket {
  /** Stable id for React keys. */
  id: string;
  kind: "release" | "branch" | "task" | "rest" | "all";
  /** Version, branch or task key; empty for "rest" / "all". */
  title: string;
  task?: MrTask;
  mrs: Mr[];
  /** Newest change in it: groups are ordered by this. */
  latest: number;
}

export interface SectionView {
  id: SectionId;
  total: number;
  buckets: Bucket[];
  /** Drafts are not waiting for anyone: kept apart, newest first. */
  drafts: Mr[];
}

function bucketKey(mr: Mr, group: GroupBy, tasks: Map<string, MrTask>): Pick<Bucket, "id" | "kind" | "title" | "task"> {
  if (group === "release") {
    const task = mr.task ? tasks.get(mr.task) : undefined;
    // A task can go into several releases; the first one is where it lands soonest.
    const version = task?.fixVersions[0];
    if (version) return { id: "v:" + version, kind: "release", title: version, task };
    if (RELEASE_BRANCH.test(mr.targetBranch)) return { id: "b:" + mr.targetBranch, kind: "branch", title: mr.targetBranch };
  } else if (group === "task") {
    const task = mr.task ? tasks.get(mr.task) : undefined;
    if (task) return { id: "t:" + task.key, kind: "task", title: task.key, task };
  } else {
    return { id: "all", kind: "all", title: "" };
  }
  return { id: "rest", kind: "rest", title: "" };
}

/** Newest change first; used for MRs inside a group and for the groups themselves. */
const byRecent = (a: Mr, b: Mr) => b.updated - a.updated;

export function groupMrs(mrs: Mr[], group: GroupBy, tasks: MrTask[]): Bucket[] {
  const known = new Map(tasks.map((t) => [t.key, t]));
  const map = new Map<string, Bucket>();
  for (const mr of [...mrs].sort(byRecent)) {
    const k = bucketKey(mr, group, known);
    const b = map.get(k.id) ?? { ...k, mrs: [], latest: 0 };
    b.mrs.push(mr);
    b.latest = Math.max(b.latest, mr.updated);
    map.set(k.id, b);
  }
  // The group with the freshest activity first; MRs without a release / task come last.
  return [...map.values()].sort((a, b) => (a.kind === "rest" ? 1 : b.kind === "rest" ? -1 : b.latest - a.latest));
}

/** The whole board as the screen shows it: sections, in them groups of live MRs, and drafts apart. */
export function buildView(board: MrBoard, team: string[], filter: Filter, group: GroupBy, pool?: ReviewPool | null): SectionView[] {
  return buildSections(board, team, filter, pool).map((s) => {
    const live = s.mrs.filter((m) => !m.draft);
    const drafts = s.mrs.filter((m) => m.draft).sort(byRecent);
    return { id: s.id, total: s.mrs.length, buckets: groupMrs(live, group, board.tasks), drafts };
  });
}
