import { describe, expect, it } from "vitest";
import type { Evt, Meeting } from "@/shared/types";
import { callsKey, callTime, mixCalls } from "./calls";

const at = (h: number, min = 0) => Date.UTC(2026, 0, 12, h, min);
const call = (title: string, h: number, minutes: number, over: Partial<Meeting> = {}): Meeting => ({
  ts: at(h), endTs: at(h) + minutes * 60_000, minutes, title, organizer: "", location: "", isCall: true, tentative: false, ...over,
});
const chat = (key: string, h: number, min = 0): Evt => ({ source: "matrix", ts: at(h, min), issueKey: key, text: "", context: null, weight: 1 });

describe("callsKey", () => {
  it("reads a key from the setting", () => {
    expect(callsKey(" proj-1234 ")).toBe("PROJ-1234");
    expect(callsKey("")).toBeNull();
    expect(callsKey("no key")).toBeNull();
  });
});

describe("callTime", () => {
  it("sends a call with no task to the fallback", () => {
    const r = callTime([call("Daily", 10, 15)], [], "OPS-1");
    expect(r.minutes).toEqual({ "OPS-1": 15 });
    expect(r.titles["OPS-1"]).toEqual(["Daily"]);
  });

  it("sends a call to the task the chat mentions around it", () => {
    const r = callTime([call("Sync with QA", 15, 30)], [chat("PAY-7", 14, 50), chat("PAY-7", 15, 40), chat("PAY-9", 15, 10)], "OPS-1");
    expect(r.minutes).toEqual({ "PAY-7": 30 });
  });

  it("ignores far-away chat messages, context tasks, tentative calls and calls with a key in the title", () => {
    const meetings = [call("Daily", 10, 15), call("Plan", 12, 60, { tentative: true }), call("PAY-5 review", 13, 30), call("Lunch", 14, 60, { isCall: false })];
    const r = callTime(meetings, [chat("PAY-7", 17), chat("CTX-1", 10, 5)], "OPS-1", (k) => k.startsWith("CTX"));
    expect(r.minutes).toEqual({ "OPS-1": 15 });
  });
});

describe("mixCalls", () => {
  it("gives calls their share of the day and keeps the total", () => {
    const w = mixCalls({ A: 3, B: 1 }, { C: 120 }, 8);
    expect(w.C).toBeCloseTo(0.25);
    expect(w.A).toBeCloseTo(0.5625);
    expect(Object.values(w).reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });

  it("caps the share and leaves a day without activity alone", () => {
    expect(mixCalls({ A: 1 }, { C: 600 }, 8).C).toBeCloseTo(0.5);
    expect(mixCalls({}, { C: 60 }, 8)).toEqual({});
  });
});
