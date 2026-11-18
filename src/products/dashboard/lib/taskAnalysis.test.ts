import { describe, expect, it } from "vitest";
import type { IssueDetail } from "@/shared/types";
import { buildAnalysisPrompt, linksIn, parseAnalysis, touchedServices } from "./taskAnalysis";

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
    const r = parseAnalysis('Here: {"summary":"S","state":"In review","done":["a",""],"next":"x","risks":[1,"r"]}', "overview");
    const pt = (text: string) => ({ text, source: "" });
    expect(r).toEqual({ mode: "overview", summary: "S", state: "In review", changes: [], sections: { done: [pt("a")], next: [], risks: [pt("r")], details: [], questions: [] } });
    expect(parseAnalysis("no json", "overview")).toBeNull();
    expect(parseAnalysis('{"foo":1}', "overview")).toBeNull();
  });

  it("keeps only the sections of the chosen mode", () => {
    const raw = '{"checks":["login -> ok"],"done":["x"],"setup":["test user"]}';
    expect(parseAnalysis(raw, "qa")?.sections).toEqual({
      checks: [{ text: "login -> ok", source: "" }], integration: [], edge: [], regression: [], setup: [{ text: "test user", source: "" }], questions: [],
    });
    expect(parseAnalysis('{"checks":["a"]}', "dev")).toBeNull();
  });
});

describe("deep context", () => {
  it("puts the task's own pages first and keeps the total within budget", () => {
    const page = (title: string, depth: number) => ({ url: `u/${title}`, title, text: "t".repeat(10_000), children: [], links: [], depth });
    const p = JSON.parse(buildAnalysisPrompt({
      detail, pages: [page("nested", 1), page("own", 0)], git: { commits: [], docs: [], searched: [], docsEnabled: false }, docs: [],
      gitlab: [{ url: "g/1", kind: "mr", title: "MR", text: "diff" }],
    }));
    expect(p.pages.map((x: { title: string; via: string }) => `${x.title}:${x.via}`)).toEqual(["own:task", "nested:nested"]);
    expect(p.pages.reduce((n: number, x: { text: string }) => n + x.text.length, 0)).toBeLessThanOrEqual(15_002);
    expect(p.gitlab).toEqual([{ kind: "mr", title: "MR", url: "g/1", text: "diff" }]);
  });
});

describe("readable answer", () => {
  it("splits the source off and reads change cards", () => {
    const r = parseAnalysis(JSON.stringify({
      summary: "S",
      changes: [{ service: "billing", what: "Add a fee field", where: ["src/fees/"], source: "MR !3" }, { service: "x" }],
      requirements: ["Fee is 2% (page \"Spec\")", { text: "Rounded down", source: "comment Ann" }],
    }), "dev")!;
    expect(r.changes).toEqual([{ service: "billing", what: "Add a fee field", where: ["src/fees/"], source: "MR !3" }]);
    expect(r.sections.requirements).toEqual([{ text: "Fee is 2%", source: 'page "Spec"' }, { text: "Rounded down", source: "comment Ann" }]);
  });

  it("lists touched services with their files", () => {
    const git = { commits: [{ repo: "billing", hash: "h", date: "", author: "", subject: "", files: ["a.ts", "b.ts"] }], docs: [], searched: [], docsEnabled: false };
    const mrs = [{ project: "team/billing", files: ["b.ts", "c.ts"] }, { project: "team/web", files: ["ui.tsx"] }] as never;
    expect(touchedServices({ git, mrs })).toEqual([{ service: "billing", files: ["b.ts", "c.ts", "a.ts"] }, { service: "web", files: ["ui.tsx"] }]);
  });
});
