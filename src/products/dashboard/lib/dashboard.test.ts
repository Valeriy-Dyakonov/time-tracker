import { describe, expect, it } from "vitest";
import type { DashIssue } from "@/shared/types";
import { epicOf, filterIssues, groupIssues, sortForProfile, splitFolded } from "./groups";
import { flagsOf, stageOf } from "./stages";

const issue = (key: string, status: string, category: string, extra: Partial<DashIssue> = {}): DashIssue => ({
  key, summary: `Task ${key}`, status, category, priority: "", issueType: "Story", project: key.split("-")[0], projectName: "P",
  parent: null, epic: null, fixVersions: [], assignee: { name: "me", display: "Me", me: true }, people: [], mine: true,
  updated: 0, resolved: null, due: null, ...extra,
});
const today = "2026-11-18";
const now = Date.parse("2026-11-18T12:00:00Z");
const day = 86_400_000;

describe("stages", () => {
  it("tells backlog, to do, dev, review, test and done apart by category and name", () => {
    expect(stageOf(issue("A-1", "Backlog", "new"))).toBe("backlog");
    expect(stageOf(issue("A-1", "To Do", "new"))).toBe("todo");
    expect(stageOf(issue("A-1", "In Progress", "indeterminate"))).toBe("dev");
    expect(stageOf(issue("A-1", "Code Review", "indeterminate"))).toBe("review");
    expect(stageOf(issue("A-1", "Ready for Test", "new"))).toBe("test");
    expect(stageOf(issue("A-1", "На проверке", "indeterminate"))).toBe("test");
    expect(stageOf(issue("A-1", "Closed", "done"))).toBe("done");
  });

  it("flags overdue, stale and unassigned tasks", () => {
    const i = issue("A-1", "In Progress", "indeterminate", { due: "2026-11-10", updated: now - 7 * day, assignee: null });
    expect(flagsOf(i, today, now)).toEqual(["overdue", "stale", "unassigned"]);
    expect(flagsOf(issue("A-2", "Done", "done", { due: "2026-11-01" }), today, now)).toEqual([]);
  });
});

describe("profiles and groups", () => {
  const list = [
    issue("A-1", "To Do", "new", { updated: 3, epic: "A-100" }),
    issue("A-2", "Testing", "indeterminate", { updated: 2, mine: false, assignee: { name: "x", display: "X", me: false }, fixVersions: ["1.2"] }),
    issue("A-3", "In Progress", "indeterminate", { updated: 1, parent: "A-1" }),
    issue("A-4", "Backlog", "new"),
  ];
  const base = { project: null, query: "", stage: null, flag: null, onlyMine: false };

  it("developer sees only own tasks; QA sees the team's with tests first", () => {
    expect(filterIssues(list, { ...base, profile: "dev" }, today, now).map((i) => i.key)).toEqual(["A-1", "A-3", "A-4"]);
    const qa = sortForProfile(filterIssues(list, { ...base, profile: "qa" }, today, now), "qa", today, now);
    expect(qa.map((i) => i.key)).toEqual(["A-2", "A-3", "A-1", "A-4"]);
  });

  it("keeps the backlog apart and groups by epic through the parent, or by release", () => {
    const { main, folded } = splitFolded(list, "lead");
    expect(folded.map((i) => i.key)).toEqual(["A-4"]);
    const byKey = new Map(list.map((i) => [i.key, i]));
    expect(epicOf(list[2], byKey)).toBe("A-100");
    const epic = issue("A-100", "In Progress", "indeterminate", { issueType: "Epic" });
    const groups = groupIssues(main, "epic", [epic], "lead");
    expect(groups.map((g) => [g.id, g.head?.key, g.issues.map((i) => i.key)])).toEqual([
      ["A-100", "A-100", ["A-1", "A-3"]],
      [null, undefined, ["A-2"]],
    ]);
    expect(groupIssues(main, "release", [], "lead").map((g) => g.id)).toEqual(["1.2", null]);
  });
});
