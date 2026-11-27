import { describe, expect, it } from "vitest";
import type { Meeting } from "@/shared/types";
import { buildPlan } from "./buildPlan";
import { callsKey, callTime, mixCalls } from "./calls";

const at = (h: number, min = 0) => Date.UTC(2026, 0, 12, h, min);
const call = (title: string, h: number, minutes: number, over: Partial<Meeting> = {}): Meeting => ({
  ts: at(h), endTs: at(h) + minutes * 60_000, minutes, title, organizer: "", location: "", isCall: true, tentative: false, ...over,
});

describe("callsKey", () => {
  it("reads a key from the setting", () => {
    expect(callsKey(" proj-1234 ")).toBe("PROJ-1234");
    expect(callsKey("")).toBeNull();
    expect(callsKey("no key")).toBeNull();
  });
});

describe("callTime", () => {
  it("sends a call with no task to the fallback", () => {
    const r = callTime([call("Daily", 10, 15)], "OPS-1");
    expect(r.minutes).toEqual({ "OPS-1": 15 });
    expect(r.titles["OPS-1"]).toEqual(["Daily"]);
  });

  it("sends a call to the task in its title, unless hours cannot go there", () => {
    const meetings = [call("PAY-5 review", 13, 30), call("CTX-1 sync", 14, 20)];
    expect(callTime(meetings, "OPS-1", (k) => k !== "CTX-1").minutes).toEqual({ "PAY-5": 30, "OPS-1": 20 });
  });

  it("does not count tentative meetings and meetings that are no calls", () => {
    const meetings = [call("Plan", 12, 60, { tentative: true }), call("Lunch", 14, 60, { isCall: false })];
    expect(callTime(meetings, "OPS-1").minutes).toEqual({});
  });
});

describe("mixCalls", () => {
  it("gives calls their share of the day and keeps the total", () => {
    const w = mixCalls({ A: 3, B: 1 }, { C: 120 }, 8);
    expect(w.C).toBeCloseTo(0.25);
    expect(w.A).toBeCloseTo(0.5625);
    expect(Object.values(w).reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });

  it("counts long calls in full and leaves a day without activity alone", () => {
    expect(mixCalls({ A: 1 }, { C: 360 }, 8).C).toBeCloseTo(0.75);
    expect(mixCalls({ A: 1 }, { C: 600 }, 8).C).toBeCloseTo(1);
    expect(mixCalls({}, { C: 60 }, 8)).toEqual({});
  });
});

describe("call time in the plan", () => {
  const act = { weights: { "A-1": 1 }, notes: {}, summary: "", reasoning: "", eventCount: 1, evidence: [] };
  const calls = { "2026-01-13": { minutes: { "OPS-1": 120 }, titles: { "OPS-1": ["Daily"] } } };
  const hours = (tasks: { key: string; hours: number }[]) => Object.fromEntries(tasks.map((x) => [x.key, x.hours]));

  it("is booked on a day without activity and is not copied to other days", () => {
    const [, withCall, after] = buildPlan(["2026-01-12", "2026-01-13", "2026-01-14"], { "2026-01-12": act }, {}, 8, "neighbors", {}, {}, calls);
    expect(hours(withCall.tasks)).toEqual({ "A-1": 6, "OPS-1": 2 });
    expect(hours(after.tasks)).toEqual({ "A-1": 8 });
  });

  it("is booked even when empty days are not filled", () => {
    const [day] = buildPlan(["2026-01-13"], {}, {}, 8, "none", {}, {}, calls);
    expect(hours(day.tasks)).toEqual({ "OPS-1": 2 });
    expect(day.basis).toBe("activity");
  });
});
