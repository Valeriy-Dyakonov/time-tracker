import { describe, expect, it, vi } from "vitest";
import { analysisId, getResult, runningJob, startJob, type Result } from "./analysisStore";

const result = (): Result => ({
  r: { mode: "dev", summary: "S", state: "", changes: [], sections: {} }, used: [], read: [], at: new Date().toISOString(),
});

describe("analysis store", () => {
  it("runs one analysis once however many panels ask, and keeps the result", async () => {
    const id = analysisId("A-1", "dev");
    const work = vi.fn(async () => result());
    const a = startJob(id, work);
    const b = startJob(id, work);
    expect(a).toBe(b);
    expect(runningJob(id)).toBe(a);
    await a.promise;
    expect(work).toHaveBeenCalledTimes(1);
    expect(runningJob(id)).toBeUndefined();
    expect(getResult(id)?.r.summary).toBe("S");
  });

  it("keeps nothing from a failed run", async () => {
    const id = analysisId("A-2", "qa");
    await expect(startJob(id, async () => { throw new Error("429"); }).promise).rejects.toThrow("429");
    expect(getResult(id)).toBeNull();
    expect(runningJob(id)).toBeUndefined();
  });
});
