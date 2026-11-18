import { describe, expect, it } from "vitest";
import type { DashIssue } from "@/shared/types";
import { containerCandidates, containerOf, containerTypes } from "./containers";
import { byColumn, epicBlocks, filterIssues, sortForProfile, splitFolded, visibleColumns } from "./groups";
import { flagsOf, stageOf } from "./stages";

const issue = (key: string, status: string, category: string, extra: Partial<DashIssue> = {}): DashIssue => ({
  key, summary: `Task ${key}`, status, category, priority: "", issueType: "Story", project: key.split("-")[0], projectName: "P",
  parent: null, epic: null, fixVersions: [], links: [], assignee: { name: "me", display: "Me", me: true }, people: [], mine: true,
  updated: 0, resolved: null, due: null, ...extra,
});
const today = "2026-11-18";
const now = Date.parse("2026-11-18T12:00:00Z");
const day = 86_400_000;
const rel = (key: string, issueType: string) => ({ key, issueType, relation: "relates to" });

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

describe("containers", () => {
  const rls = issue("R-1", "Open", "new", { issueType: "RLS" });
  const story = issue("A-1", "In Progress", "indeterminate", { links: [rel("R-1", "RLS"), rel("B-5", "Bug")] });
  const sub = issue("A-2", "To Do", "new", { issueType: "Sub-task", parent: "A-1" });
  const loose = issue("A-3", "To Do", "new", { links: [rel("B-5", "Bug")] });
  const byKey = new Map([rls, story, sub, loose].map((i) => [i.key, i]));

  it("guesses container types by name and counts how many tasks use them", () => {
    const c = containerCandidates([story, sub, loose], byKey);
    expect(c.map((x) => [x.type, x.count, x.auto])).toEqual([["RLS", 1, true], ["Bug", 2, false], ["Story", 1, false]]);
    expect([...containerTypes(null, c)]).toEqual(["rls"]);
    expect([...containerTypes(["BFR"], c)]).toEqual(["bfr"]);
  });

  it("finds the container by Epic Link, a link, or through the parent", () => {
    const types = new Set(["rls"]);
    expect(containerOf(story, byKey, types)).toBe("R-1");
    expect(containerOf(sub, byKey, types)).toBe("R-1");
    expect(containerOf(loose, byKey, types)).toBeNull();
    expect(containerOf(issue("A-9", "To Do", "new", { epic: "E-1", links: [rel("R-1", "RLS")] }), byKey, types)).toBe("E-1");
  });
});

describe("profiles and board", () => {
  const list = [
    issue("A-1", "To Do", "new", { updated: 3, epic: "E-1" }),
    issue("A-2", "Testing", "indeterminate", { updated: 2, mine: false, assignee: { name: "x", display: "X", me: false }, fixVersions: ["1.2"] }),
    issue("A-3", "In Progress", "indeterminate", { updated: 1, epic: "E-1" }),
    issue("A-4", "Backlog", "new"),
    issue("A-5", "Done", "done", { resolved: now - 10 * day }),
  ];
  const base = { project: null, query: "", stage: null, flag: null, onlyMine: false };

  it("developer sees only own tasks; QA sees the team's with tests first", () => {
    expect(filterIssues(list, { ...base, profile: "dev" }, today, now).map((i) => i.key)).toEqual(["A-1", "A-3", "A-4", "A-5"]);
    const qa = sortForProfile(filterIssues(list, { ...base, profile: "qa" }, today, now), "qa", today, now);
    expect(qa.map((i) => i.key)).toEqual(["A-2", "A-3", "A-1", "A-5", "A-4"]);
  });

  it("one board: columns by stage (no done), epic blocks inside a column, backlog kept apart", () => {
    const { main, folded } = splitFolded(list.filter((i) => stageOf(i) !== "done"), "lead");
    expect(folded.map((i) => i.key)).toEqual(["A-4"]);
    expect(visibleColumns(main)).toEqual(["todo", "dev", "test"]);
    expect(visibleColumns([...main, issue("A-9", "Ready to merge", "indeterminate")])).toEqual(["todo", "dev", "test", "ship"]);
    const cells = byColumn(main, visibleColumns(main));
    expect(Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v.map((i) => i.key)]))).toEqual({ todo: ["A-1"], dev: ["A-3"], test: ["A-2"] });
    const byKey = new Map(main.map((i) => [i.key, i]));
    const blocks = epicBlocks([...cells.todo, issue("A-7", "To Do", "new"), issue("A-8", "To Do", "new", { epic: "E-1" })], byKey, new Set(["epic"]));
    expect(blocks.map((b) => [b.id, b.issues.map((i) => i.key)])).toEqual([["E-1", ["A-1", "A-8"]], [null, ["A-7"]]]);
  });
});
