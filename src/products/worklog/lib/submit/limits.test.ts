import { describe, expect, it } from "vitest";
import type { DayPlan } from "@/shared/types";
import { checkLimits, perDay } from "./limits";

const day = (date: string, target: number, off = false) => ({ date, target, off }) as DayPlan;
const days = [day("2026-11-13", 8), day("2026-11-14", 0, true), day("2026-11-16", 7)];

describe("checkLimits", () => {
  it("passes when every day fits its norm", () => {
    const r = checkLimits(perDay([{ date: "2026-11-13", minutes: 480 }, { date: "2026-11-16", minutes: 400 }]), days, "2026-11-13", "2026-11-16");
    expect(r).toMatchObject({ ok: true, total: 880, limit: 900 });
  });

  it("flags days over the norm, days off and dates outside the period", () => {
    const r = checkLimits(
      perDay([
        { date: "2026-11-13", minutes: 300 }, { date: "2026-11-13", minutes: 300 },
        { date: "2026-11-14", minutes: 60 },
        { date: "2026-11-20", minutes: 60 },
      ]),
      days, "2026-11-13", "2026-11-16",
    );
    expect(r.ok).toBe(false);
    expect(r.overDays).toEqual([
      { date: "2026-11-13", minutes: 600, limit: 480, off: false },
      { date: "2026-11-14", minutes: 60, limit: 0, off: true },
    ]);
    expect(r.outside).toEqual(["2026-11-20"]);
  });

  it("compares the period total with the sum of day norms", () => {
    const r = checkLimits(perDay([{ date: "2026-11-13", minutes: 480 }, { date: "2026-11-16", minutes: 420 }]), [day("2026-11-13", 8), day("2026-11-16", 8)].map((d, i) => (i ? { ...d, target: 7 } : d)), "2026-11-13", "2026-11-16");
    expect(r.ok).toBe(true);
    expect(checkLimits(perDay([{ date: "2026-11-13", minutes: 481 }]), [day("2026-11-13", 8)], "2026-11-13", "2026-11-13").ok).toBe(false);
  });
});
