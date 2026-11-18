import type { DashIssue } from "@/shared/types";

/**
 * Where a task stands, independent of how an installation names its statuses:
 * the Jira status category plus the status name (review / test / backlog are named, not categorised).
 */
export type Stage = "backlog" | "todo" | "dev" | "review" | "test" | "done";
export const STAGES: Stage[] = ["backlog", "todo", "dev", "review", "test", "done"];

const has = (name: string, words: string[]) => {
  const n = name.toLowerCase();
  return words.some((w) => n.includes(w));
};
const TEST = ["test", "qa", "verif", "тест", "провер", "acceptance", "приемк", "приёмк"];
const REVIEW = ["review", "ревью", "merge", "code check"];
const BACKLOG = ["backlog", "бэклог", "беклог", "icebox", "someday", "later", "отлож"];

export function stageOf(i: DashIssue): Stage {
  if (i.category === "done") return "done";
  if (has(i.status, TEST)) return "test";
  if (has(i.status, REVIEW)) return "review";
  if (i.category === "new") return has(i.status, BACKLOG) ? "backlog" : "todo";
  return "dev";
}

export type Profile = "dev" | "qa" | "lead";
export const PROFILES: Profile[] = ["dev", "qa", "lead"];

export interface ProfileSpec {
  /** Stages in the order they matter to this role; the first ones are brought forward. */
  order: Stage[];
  /** Shown as stat tiles. */
  focus: Stage[];
  /** Folded into a separate block below everything else. */
  folded: Stage[];
  /** Only tasks the user is in (assignee or a people field); QA and lead also see the team's. */
  mineOnly: boolean;
}

export const PROFILE: Record<Profile, ProfileSpec> = {
  dev: { order: ["dev", "review", "todo", "test", "done", "backlog"], focus: ["todo", "dev", "review"], folded: ["backlog"], mineOnly: true },
  qa: { order: ["test", "review", "dev", "todo", "done", "backlog"], focus: ["test"], folded: ["backlog"], mineOnly: false },
  lead: { order: ["dev", "review", "test", "todo", "done", "backlog"], focus: ["todo", "dev", "review", "test"], folded: ["backlog"], mineOnly: false },
};

/** No change for this long in an active stage looks stuck. */
export const STALE_DAYS = 5;
const ACTIVE: Stage[] = ["dev", "review", "test"];

export type Flag = "overdue" | "stale" | "unassigned";

export function flagsOf(i: DashIssue, today: string, now: number): Flag[] {
  const s = stageOf(i);
  const out: Flag[] = [];
  if (s !== "done" && i.due && i.due < today) out.push("overdue");
  if (ACTIVE.includes(s) && i.updated && now - i.updated > STALE_DAYS * 86_400_000) out.push("stale");
  if (s !== "done" && s !== "backlog" && !i.assignee) out.push("unassigned");
  return out;
}

/** Which flags a role watches. */
export const PROFILE_FLAGS: Record<Profile, Flag[]> = { dev: ["overdue"], qa: ["overdue", "stale"], lead: ["overdue", "stale", "unassigned"] };
