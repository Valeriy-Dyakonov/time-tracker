import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Dashboard from "./Dashboard";

/** Renders the whole dashboard (board, lanes, cards) from data already in hand, the way it opens before the store answers. */
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

const day = 86_400_000;
const task = (key: string, status: string, category: string, extra: object = {}) => ({
  key, summary: `Task ${key}`, status, category, priority: "High", issueType: "Story", project: "A", projectName: "Alpha",
  parent: null, epic: null, fixVersions: ["1.0"], links: [{ key: "R-1", issueType: "Release", relation: "relates to" }],
  assignee: { name: "me", display: "Me", me: true }, people: [{ field: "QA", person: { name: "q", display: "Q", me: false } }],
  mine: true, updated: Date.now() - day, resolved: null, due: "2026-01-01", ...extra,
});

const render = (data: object) => {
  const setup = { jira: true, llm: true, confluence: false, calendar: false, matrix: false, git: false, gitlab: false };
  return renderToString(<Dashboard setup={setup} profile="dev" onOpenSettings={() => {}} initial={data} />);
};

describe("Dashboard render", () => {
  it("draws one board: columns, epic blocks and cards", () => {
    const html = render({
      issues: [
        task("A-1", "To Do", "new"),
        task("A-2", "In Progress", "indeterminate"),
        task("A-3", "Code Review", "indeterminate", { links: [] }),
        task("A-4", "Testing", "indeterminate", { assignee: null }),
        task("A-5", "Done", "done", { resolved: Date.now() - 10 * day }),
        task("A-6", "Backlog", "new"),
      ],
      context: [task("R-1", "Open", "new", { issueType: "Release", links: [] })],
      projects: ["A"],
    });
    expect(html).toContain("A-1");
    expect(html).toContain("R-1");
    expect(html).toContain("epic-block");
    expect(html).toContain("board-col s-test");
    expect(html).not.toContain("A-5"); // done lives in the history
  });

  it("does not crash on data cached by an older version (no links, no people)", () => {
    const html = render({ issues: [{ key: "A-1", summary: "Old", status: "To Do", category: "new", mine: true }] });
    expect(html).toContain("A-1");
  });
});
