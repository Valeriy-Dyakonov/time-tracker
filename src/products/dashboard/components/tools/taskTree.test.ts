import { describe, expect, it } from "vitest";
import { underTask } from "./TaskTools";
import { commitId, mergeDev, mrId, type TaskDev } from "./useTaskDev";

const mr = (projectId: number, iid: number, project = "g/app") => ({
  project, projectId, iid, title: `MR ${iid}`, state: "merged", webUrl: "https://git/x", sourceBranch: "f", targetBranch: "main", author: "Ann", updated: "2026-11-10T00:00:00Z", commits: [], files: [],
});
const commit = (hash: string) => ({ repo: "app", hash, date: "2026-11-10T00:00:00Z", author: "Ann", subject: hash, files: [] });
const dev = (mrs: ReturnType<typeof mr>[], commits: ReturnType<typeof commit>[] = []): TaskDev => ({
  git: { commits, docs: [], searched: [{ repoName: "app", refs: [], error: null }], docsEnabled: false },
  mrs: { configured: true, mrs, docs: [], error: null },
});

describe("mergeDev", () => {
  it("puts the parent's and the subtasks' work together, each MR once, credited to the first task that has it", () => {
    const merged = mergeDev([
      { key: "A-1", dev: dev([mr(1, 5)]) },
      { key: "A-2", dev: dev([mr(1, 5), mr(2, 7, "g/lib")], [commit("abc")]) },
    ]);
    expect(merged.mrs.mrs.map((r) => `${r.project}!${r.iid}`)).toEqual(["g/app!5", "g/lib!7"]);
    expect(merged.owner).toEqual({ [mrId({ projectId: 1, iid: 5 })]: "A-1", [mrId({ projectId: 2, iid: 7 })]: "A-2", [commitId("abc")]: "A-2" });
    expect(merged.children).toEqual(["A-2"]);
    expect(merged.mrs.configured).toBe(true);
  });
});

describe("underTask", () => {
  const ctx = new Map([
    ["A-2", { key: "A-2", parent: "A-1", epic: null }],
    ["A-3", { key: "A-3", parent: null, epic: "A-1" }],
    ["B-1", { key: "B-1", parent: null, epic: null }],
  ]);
  it("takes the subtasks and the tasks whose parent or epic is the task", () => {
    const rel = (key: string) => ({ key, summary: "", status: "", category: "", relation: "relates to" });
    const detail = { key: "A-1", subtasks: [rel("A-4")], linked: [rel("C-9")] };
    expect(underTask(detail, ctx)).toEqual(["A-2", "A-3", "A-4", "C-9"]);
  });
  it("is empty for a task with nothing under it", () => {
    expect(underTask({ key: "B-1", subtasks: [], linked: [] }, ctx)).toEqual([]);
  });
});
