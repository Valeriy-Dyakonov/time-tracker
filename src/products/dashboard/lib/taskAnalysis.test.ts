import { describe, expect, it } from "vitest";
import type { IssueDetail } from "@/shared/types";
import { buildAnalysisPrompt, linksIn, parseAnalysis } from "./taskAnalysis";

const detail = {
  key: "A-1", summary: "Import", status: "In Progress", category: "indeterminate", priority: "High", issueType: "Story",
  project: "A", projectName: "Alpha", parent: null, epic: null, fixVersions: [], links: [], assignee: null, people: [],
  mine: true, updated: null, resolved: null, due: null, reporter: null, created: null, labels: [], components: [],
  description: "x".repeat(9000), comments: Array.from({ length: 20 }, (_, n) => ({ author: "Q", created: 0, body: `c${n}` })),
  commentTotal: 20, subtasks: [], linked: [],
} as IssueDetail;

describe("task analysis", () => {
  it("finds wiki links in description and comments", () => {
    expect(linksIn("see [spec|https://wiki/a] and https://wiki/b.", "*[x|https://wiki/a]*")).toEqual(["https://wiki/a", "https://wiki/b"]);
  });

  it("packs the task with long parts cut and only recent comments", () => {
    const p = JSON.parse(buildAnalysisPrompt({ detail, pages: [], git: { commits: [], docs: [], searched: [], docsEnabled: false }, docs: [] }));
    expect(p.task.description.length).toBeLessThanOrEqual(8001);
    expect(p.comments.map((c: { text: string }) => c.text)).toEqual(Array.from({ length: 15 }, (_, n) => `c${n + 5}`));
  });

  it("reads the answer tolerantly", () => {
    const r = parseAnalysis('Here: {"summary":"S","state":"In review","done":["a",""],"next":"x","risks":[1,"r"]}');
    expect(r).toEqual({ summary: "S", state: "In review", done: ["a"], next: [], risks: ["r"], details: [], questions: [] });
    expect(parseAnalysis("no json")).toBeNull();
    expect(parseAnalysis('{"foo":1}')).toBeNull();
  });
});
