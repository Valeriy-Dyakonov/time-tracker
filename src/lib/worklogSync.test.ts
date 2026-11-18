import { describe, expect, it } from "vitest";
import type { JiraWorklog } from "../types";
import type { WorklogRow } from "./submit";
import { bulkPlan, dayMatches, indexWorklogs, mismatchedDays, rowSync, unplanned } from "./worklogSync";

const row = (key: string, date: string, hours: number): WorklogRow => ({ key, date, hours, comment: "c", inferred: false });
const wl = (key: string, date: string, seconds: number, id = "1"): JiraWorklog => ({ id, key, date, seconds, comment: "" });

describe("rowSync", () => {
  it("tells empty, partial and filled rows apart in whole minutes", () => {
    expect(rowSync(row("A-1", "2026-11-10", 2)).state).toBe("none");
    expect(rowSync(row("A-1", "2026-11-10", 2), [wl("A-1", "2026-11-10", 3600)])).toMatchObject({ state: "partial", logged: 60, missing: 60 });
    expect(rowSync(row("A-1", "2026-11-10", 7 / 3), [wl("A-1", "2026-11-10", 8400)]).state).toBe("full");
    expect(rowSync(row("A-1", "2026-11-10", 1), [wl("A-1", "2026-11-10", 3600)])).toMatchObject({ state: "full", missing: 0 });
    expect(rowSync(row("A-1", "2026-11-10", 1), [wl("A-1", "2026-11-10", 7200)])).toMatchObject({ state: "over", missing: 0 });
  });
});

describe("bulkPlan", () => {
  it("adds only the missing time and skips filled rows", () => {
    const rows = [row("A-1", "2026-11-10", 4), row("A-2", "2026-11-10", 4), row("A-1", "2026-11-11", 8)];
    const index = indexWorklogs([wl("A-1", "2026-11-10", 3600), wl("A-1", "2026-11-10", 3600, "2"), wl("A-2", "2026-11-10", 4 * 3600)]);
    const plan = bulkPlan(rows, index, (r) => `${r.key} ${r.date}`);
    expect(plan.map((p) => [p.row.key, p.row.date, p.minutes, p.topUp])).toEqual([
      ["A-1", "2026-11-10", 120, true],
      ["A-1", "2026-11-11", 480, false],
    ]);
    expect(plan[0].comment).toBe("A-1 2026-11-10");
  });
});

describe("day comparison", () => {
  const rows = [row("A-1", "2026-11-10", 4), row("A-2", "2026-11-10", 4), row("A-1", "2026-11-11", 8)];
  const list = [wl("A-1", "2026-11-10", 4 * 3600), wl("A-2", "2026-11-10", 4 * 3600), wl("B-9", "2026-11-11", 3600), wl("A-1", "2026-11-14", 1800)];

  it("sums every worklog of the day, planned or not", () => {
    const days = dayMatches(rows, list);
    expect(days.get("2026-11-10")).toEqual({ planned: 480, logged: 480 });
    expect(days.get("2026-11-11")).toEqual({ planned: 480, logged: 60 });
    expect(days.get("2026-11-14")).toEqual({ planned: 0, logged: 30 });
    expect(mismatchedDays(days)).toEqual(["2026-11-11", "2026-11-14"]);
  });

  it("lists worklogs outside the plan", () => {
    expect(unplanned(rows, list).map((w) => `${w.key} ${w.date}`)).toEqual(["B-9 2026-11-11", "A-1 2026-11-14"]);
  });
});
