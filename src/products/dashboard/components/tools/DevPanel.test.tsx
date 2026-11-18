import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DevPanel } from "./DevPanel";

describe("DevPanel", () => {
  it("shows merge requests, commits and where it looked", () => {
    const html = renderToString(
      <DevPanel dev={{
        git: {
          commits: [{ repo: "app", hash: "abcdef123456", date: "2026-11-10T10:00:00+03:00", author: "Ivan", subject: "ABC-1 plan", files: ["a.ts"] }],
          docs: [], docsEnabled: false,
          searched: [{ repoName: "app", refs: ["HEAD"], error: null }, { repoName: "gone", refs: [], error: "not a git repository" }],
        },
        mrs: {
          configured: true, docs: [], error: { code: "http", params: { service: "GitLab", status: "500", body: "x" } },
          mrs: [{ project: "team/app", projectId: 1, iid: 12, title: "ABC-1 import", state: "merged", webUrl: "https://git/x", sourceBranch: "feature/abc-1", targetBranch: "main", author: "Ivan", updated: "2026-11-11T00:00:00Z", commits: [], files: ["docs/ai/ABC-1/plan.md"] }],
        },
      }} onReload={() => {}} />,
    );
    for (const s of ["ABC-1 import", "team/app", "feature/abc-1", "abcdef12", "ABC-1 plan", "not a git repository", "GitLab HTTP 500"]) expect(html).toContain(s);
  });
});
