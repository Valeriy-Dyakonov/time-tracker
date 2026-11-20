import { describe, expect, it } from "vitest";
import type { Mr, MrDetail, MrFailedJob } from "@/shared/types";
import { logsFacts, pipeTone } from "./pipeline";

const mr = { title: "ABC-1 fix", sourceBranch: "feature/abc-1", targetBranch: "main" } as Mr;

describe("pipeTone", () => {
  it("maps GitLab statuses and treats unknown ones as neutral", () => {
    expect(pipeTone("success")).toBe("good");
    expect(pipeTone("failed")).toBe("bad");
    expect(pipeTone("running")).toBe("run");
    expect(pipeTone("created")).toBe("wait");
    expect(pipeTone("manual")).toBe("warn");
    expect(pipeTone("something_new")).toBe("off");
  });
});

describe("logsFacts", () => {
  const detail = (jobs: MrFailedJob[]): MrDetail => ({
    pipeline: { status: "failed", url: "u", failedStage: "test", jobs },
    threads: [],
    resolved: 0,
  });
  it("lists the failed jobs with their log lines", () => {
    const text = logsFacts(mr, detail([{ id: 1, name: "unit", stage: "test", reason: "script_failure", url: "j", lines: ["FAIL a.test.ts", "exit code 1"] }]));
    expect(text).toContain("First failed stage: test");
    expect(text).toContain("Job: unit (stage: test, reason: script_failure)\n  FAIL a.test.ts\n  exit code 1");
  });
  it("is empty when nothing failed", () => {
    expect(logsFacts(mr, { pipeline: null, threads: [], resolved: 0 })).toBe("");
    expect(logsFacts(mr, detail([]))).toBe("");
  });
});
