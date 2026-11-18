import { describe, expect, it } from "vitest";
import type { DashIssue } from "@/shared/types";
import { boardColumns, dashStats, filterIssues, projectsOf } from "./dashboard";

const issue = (key: string, status: string, category: string, extra: Partial<DashIssue> = {}): DashIssue => ({
  key, summary: `Task ${key}`, status, category, priority: "Medium", issueType: "Story",
  project: key.split("-")[0], projectName: "P", parent: null, updated: 0, resolved: null, due: null, ...extra,
});
const today = "2026-11-18";
const list = [
  issue("A-1", "To Do", "new", { updated: 1 }),
  issue("A-2", "In Progress", "indeterminate", { updated: 5, due: "2026-11-10" }),
  issue("A-3", "In Review", "indeterminate", { updated: 9 }),
  issue("B-1", "In Progress", "indeterminate", { updated: 7 }),
  issue("B-2", "Done", "done", { resolved: 1, due: "2026-11-01" }),
];

describe("dashboard", () => {
  it("counts open, in progress, overdue and recently done; done tasks are never overdue", () => {
    expect(dashStats(list, today)).toEqual({ open: 4, inProgress: 3, overdue: 1, done: 1 });
  });

  it("groups by category and exact status, overdue first then most recent", () => {
    const cols = boardColumns(list, today);
    expect(cols.indeterminate.map((g) => [g.status, g.issues.map((i) => i.key)])).toEqual([
      ["In Progress", ["A-2", "B-1"]],
      ["In Review", ["A-3"]],
    ]);
    expect(cols.new[0].issues.map((i) => i.key)).toEqual(["A-1"]);
    expect(cols.done[0].issues.map((i) => i.key)).toEqual(["B-2"]);
  });

  it("filters by project and text, and counts projects", () => {
    expect(filterIssues(list, { project: "B", query: "" }).map((i) => i.key)).toEqual(["B-1", "B-2"]);
    expect(filterIssues(list, { project: null, query: "a-3" }).map((i) => i.key)).toEqual(["A-3"]);
    expect(projectsOf(list).map((p) => [p.key, p.count])).toEqual([["A", 3], ["B", 2]]);
  });
});
