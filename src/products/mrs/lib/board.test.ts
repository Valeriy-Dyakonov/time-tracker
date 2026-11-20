import { describe, expect, it } from "vitest";
import type { Mr, MrBoard, MrPerson, MrTask, Roster } from "@/shared/types";
import { buildSections, buildView, factsOf, filterCounts, groupMrs, isStale, needsMyReview, reviewPool, teamUsernames } from "./board";

const p = (username: string): MrPerson => ({ username, name: username });
const mr = (iid: number, author: string, over: Partial<Mr> = {}): Mr => ({
  projectId: 1, iid, project: "g/p", title: `t${iid}`, url: "", sourceBranch: "b", targetBranch: "main", task: null, author: p(author), draft: false, conflicts: false,
  discussionsResolved: true, mergeStatus: "not_approved", comments: 0, created: 0, updated: iid, reviewers: [], approvedBy: [], approvalsLeft: 1, detailed: true, pipeline: null, ...over,
});
const board = (mrs: Mr[], tasks: MrTask[] = []): MrBoard => ({ me: p("me"), mrs, cachedAt: 0, tasks });
const task = (key: string, ...fixVersions: string[]): MrTask => ({ key, summary: `s ${key}`, status: "In Progress", fixVersions });

describe("facts", () => {
  it("waits for approvals unless a draft, or none are missing", () => {
    expect(factsOf(mr(1, "a")).waiting).toBe(true);
    expect(factsOf(mr(1, "a", { draft: true })).waiting).toBe(false);
    expect(factsOf(mr(1, "a", { approvalsLeft: 0 })).waiting).toBe(false);
  });
  it("without approval rules it is waiting until someone approved", () => {
    expect(factsOf(mr(1, "a", { approvalsLeft: null })).waiting).toBe(true);
    expect(factsOf(mr(1, "a", { approvalsLeft: null, approvedBy: [p("x")] })).waiting).toBe(false);
  });
  it("reads threads and readiness", () => {
    const f = factsOf(mr(1, "a", { discussionsResolved: false, mergeStatus: "mergeable" }));
    expect([f.threads, f.ready]).toEqual([true, true]);
  });
});

describe("sections", () => {
  const all = board([
    mr(1, "ann", { reviewers: [p("me")] }),
    mr(2, "me", { reviewers: [p("ann")] }),
    mr(3, "bob"),
    mr(4, "zed"),
    mr(5, "ann", { reviewers: [p("me")], approvedBy: [p("me")] }),
    mr(6, "ann", { reviewers: [p("me")], draft: true }),
  ]);

  it("separates what waits for me, my own and the team", () => {
    const s = buildSections(all, ["ann", "bob"], "all");
    expect(s.map((x) => x.mrs.map((m) => m.iid))).toEqual([[1], [2], [6, 5, 3]]);
  });

  it("an MR I should review is not repeated among the team ones", () => {
    const team = buildSections(all, ["ann"], "all").find((s) => s.id === "team")!;
    expect(team.mrs.some((m) => m.iid === 1)).toBe(false);
  });

  it("filters across all sections and counts them", () => {
    const b = board([mr(1, "ann", { reviewers: [p("me")], discussionsResolved: false }), mr(2, "me", { approvalsLeft: 0, mergeStatus: "mergeable" })]);
    expect(buildSections(b, [], "threads").map((s) => s.mrs.length)).toEqual([1, 0, 0]);
    expect(filterCounts(b, [])).toEqual({ all: 2, waiting: 1, threads: 1, ready: 1 });
  });

  it("knows who is asked to review", () => {
    expect(needsMyReview(mr(1, "ann", { reviewers: [p("me")] }), "me")).toBe(true);
    expect(needsMyReview(mr(1, "me", { reviewers: [p("me")] }), "me")).toBe(false);
  });
});

describe("teamUsernames", () => {
  const roster: Roster = {
    teams: [{ id: 1, parentId: null, name: "Dept" }, { id: 2, parentId: 1, name: "Backend" }, { id: 3, parentId: null, name: "Other" }],
    people: [
      { id: 1, teamId: 2, name: "A", role: "dev", accounts: [{ system: "gitlab", extId: "ann" }, { system: "jira", extId: "ann.j" }], absences: [] },
      { id: 2, teamId: 3, name: "B", role: "dev", accounts: [{ system: "gitlab", extId: "bob" }], absences: [] },
      { id: 3, teamId: 1, name: "C", role: "qa", accounts: [], absences: [] },
    ],
  };
  it("takes GitLab accounts of a team with its sub-teams", () => {
    expect(teamUsernames(roster, 1)).toEqual(["ann"]);
    expect(teamUsernames(roster, 3)).toEqual(["bob"]);
  });
  it("everyone when no team is chosen", () => {
    expect(teamUsernames(roster, null).sort()).toEqual(["ann", "bob"]);
  });
});

describe("grouping", () => {
  const tasks = [task("A-1", "2.0", "1.9"), task("A-2", "2.0"), task("A-3")];
  const mrs = [
    mr(1, "me", { task: "A-1", updated: 100 }),
    mr(2, "me", { task: "A-2", updated: 300 }),
    mr(3, "me", { task: "A-3", updated: 200, targetBranch: "release/1.5" }),
    mr(4, "me", { task: null, updated: 400 }),
    mr(5, "me", { task: "A-1", updated: 50 }),
  ];

  it("by release: the fix version, else a release branch, else the rest; freshest group first", () => {
    const b = groupMrs(mrs, "release", tasks);
    expect(b.map((x) => [x.title, x.mrs.map((m) => m.iid)])).toEqual([
      ["2.0", [2, 1, 5]],
      ["release/1.5", [3]],
      ["", [4]],
    ]);
    expect(b[2].kind).toBe("rest");
  });

  it("by task: one group per known task, newest MR first, unknown ones last", () => {
    const b = groupMrs(mrs, "task", tasks);
    expect(b.map((x) => x.title)).toEqual(["A-2", "A-3", "A-1", ""]);
    expect(b[2].mrs.map((m) => m.iid)).toEqual([1, 5]);
    expect(b[0].task?.summary).toBe("s A-2");
  });

  it("a task Jira did not return falls into the rest", () => {
    expect(groupMrs([mr(1, "me", { task: "UTF-8" })], "task", tasks)[0].kind).toBe("rest");
  });

  it("without grouping there is one group, newest first", () => {
    const b = groupMrs(mrs, "none", tasks);
    expect(b).toHaveLength(1);
    expect(b[0].mrs.map((m) => m.iid)).toEqual([4, 2, 3, 1, 5]);
  });

  it("drafts are kept apart in every section and counted", () => {
    const v = buildView(board([mr(1, "me", { draft: true, updated: 5 }), mr(2, "me", { updated: 9 }), mr(3, "me", { draft: true, updated: 7 })], tasks), [], "all", "none");
    const mine = v.find((s) => s.id === "mine")!;
    expect(mine.total).toBe(3);
    expect(mine.buckets[0].mrs.map((m) => m.iid)).toEqual([2]);
    expect(mine.drafts.map((m) => m.iid)).toEqual([3, 1]);
  });

  it("an MR is stale after two weeks without changes", () => {
    const day = 86_400_000;
    expect(isStale(mr(1, "a", { updated: 0 }), 15 * day)).toBe(true);
    expect(isStale(mr(1, "a", { updated: 0 }), 13 * day)).toBe(false);
  });
});

describe("review pool of a developer", () => {
  const roster: Roster = {
    teams: [{ id: 1, parentId: null, name: "Backend" }, { id: 2, parentId: null, name: "Other" }],
    people: [
      { id: 1, teamId: 1, name: "Dev", role: "dev", accounts: [{ system: "gitlab", extId: "dev1" }], absences: [] },
      { id: 2, teamId: 1, name: "Lead", role: "devLead", accounts: [{ system: "gitlab", extId: "lead1" }], absences: [] },
      { id: 3, teamId: 1, name: "Tester", role: "qa", accounts: [{ system: "gitlab", extId: "qa1" }], absences: [] },
      { id: 4, teamId: 2, name: "Far", role: "dev", accounts: [{ system: "gitlab", extId: "far1" }], absences: [] },
    ],
  };
  const pool = reviewPool(roster, 1);

  it("takes the team's developers and leads by role", () => {
    expect([...pool.devs]).toEqual(["dev1"]);
    expect([...pool.leads]).toEqual(["lead1"]);
  });
  it("waits for my review: the team's developers and the lead, but nothing into master", () => {
    expect(needsMyReview(mr(1, "dev1", { targetBranch: "develop" }), "me", pool)).toBe(true);
    expect(needsMyReview(mr(2, "lead1", { targetBranch: "release/2.5" }), "me", pool)).toBe(true);
    expect(needsMyReview(mr(3, "lead1", { targetBranch: "master" }), "me", pool)).toBe(false);
    expect(needsMyReview(mr(4, "dev1", { targetBranch: "main" }), "me", pool)).toBe(false);
  });
  it("not the testers, other teams, drafts, my own or the ones I approved", () => {
    expect(needsMyReview(mr(1, "qa1"), "me", pool)).toBe(false);
    expect(needsMyReview(mr(2, "far1"), "me", pool)).toBe(false);
    expect(needsMyReview(mr(3, "dev1", { draft: true }), "me", pool)).toBe(false);
    expect(needsMyReview(mr(4, "me"), "me", pool)).toBe(false);
    expect(needsMyReview(mr(5, "dev1", { approvedBy: [p("me")] }), "me", pool)).toBe(false);
  });
  it("an MR that names me still counts, also one into master; without a pool only those count", () => {
    expect(needsMyReview(mr(1, "lead1", { targetBranch: "master", reviewers: [p("me")] }), "me", pool)).toBe(true);
    expect(needsMyReview(mr(2, "dev1", { targetBranch: "develop" }), "me")).toBe(false);
  });
  it("fills the review section and takes them out of the team's", () => {
    const b = board([mr(1, "dev1", { targetBranch: "develop" }), mr(2, "lead1", { targetBranch: "master" }), mr(3, "me")]);
    const s = buildSections(b, ["dev1", "lead1"], "all", pool);
    expect(s.map((x) => x.mrs.map((m) => m.iid))).toEqual([[1], [3], [2]]);
  });
});
