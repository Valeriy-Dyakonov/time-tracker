import { describe, expect, it } from "vitest";
import { addCustom, appName, customApps, groupByDay, isOn, setApp } from "./callApps";

describe("call programs list", () => {
  it("tells known programs from typed ones", () => {
    expect(customApps(["zoom", "Teams", "mumble"])).toEqual(["mumble"]);
    expect(isOn(["Zoom"], "zoom")).toBe(true);
  });

  it("switches a program on and off without repeats", () => {
    expect(setApp(["zoom"], "zoom", true)).toEqual(["zoom"]);
    expect(setApp(["zoom", "teams"], "zoom", false)).toEqual(["teams"]);
  });

  it("adds a typed name cleaned up and skips empty ones", () => {
    expect(addCustom(["zoom"], "  Mumble.EXE ")).toEqual(["zoom", "mumble"]);
    expect(addCustom(["zoom"], "   ")).toEqual(["zoom"]);
    expect(addCustom(["mumble"], "Mumble")).toEqual(["mumble"]);
  });

  it("names known programs and groups calls by day, newest day first", () => {
    expect(appName("teams")).toBe("Microsoft Teams");
    expect(appName("mumble")).toBe("mumble");
    const day = (ms: number) => (ms < 100 ? "a" : "b");
    const got = groupByDay([{ started: 150 }, { started: 20 }, { started: 10 }], day);
    expect(got.map((g) => [g.day, g.calls.map((c) => c.started)])).toEqual([["b", [150]], ["a", [10, 20]]]);
  });
});
