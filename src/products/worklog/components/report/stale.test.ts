import { describe, expect, it } from "vitest";
import type { Analysis } from "@/shared/types";
import { staleReason } from "./stale";

const a = { start: "2026-11-01", end: "2026-11-30", hoursPerDay: 8, fillMode: "neighbors" } as Analysis;
const same = { start: "2026-11-01", end: "2026-11-30", hours: 8, fillMode: "neighbors" as const };

describe("staleReason", () => {
  it("is null with no result or a result that matches the choice", () => {
    expect(staleReason(null, same, true)).toBeNull();
    expect(staleReason(a, same, false)).toBeNull();
  });
  it("names the period when anything chosen differs from the run", () => {
    expect(staleReason(a, { ...same, end: "2026-11-19" }, false)).toBe("period");
    expect(staleReason(a, { ...same, hours: 6 }, false)).toBe("period");
    expect(staleReason(a, { ...same, fillMode: "none" }, true)).toBe("period");
  });
  it("names the calls when they were changed after the run", () => {
    expect(staleReason(a, same, true)).toBe("calls");
  });
});
