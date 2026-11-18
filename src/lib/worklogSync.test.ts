import { describe, expect, it } from "vitest";
import type { JiraWorklog } from "../types";
import type { WorklogRow } from "./submit";
import { bulkPlan, indexWorklogs, rowSync } from "./worklogSync";

const row = (key: string, date: string, hours: number): WorklogRow => ({ key, date, hours, comment: "c", inferred: false });
const wl = (key: string, date: string, seconds: number, id = "1"): JiraWorklog => ({ id, key, date, seconds, comment: "" });

describe("rowSync", () => {
  it("tells empty, partial and filled rows apart in whole minutes", () => {
    expect(rowSync(row("A-1", "2026-11-10", 2)).state).toBe("none");
    expect(rowSync(row("A-1", "2026-11-10", 2), [wl("A-1", "2026-11-10", 3600)])).toMatchObject({ state: "partial", logged: 60, missing: 60 });
    expect(rowSync(row("A-1", "2026-11-10", 7 / 3), [wl("A-1", "2026-11-10", 8400)]).state).toBe("full");
    expect(rowSync(row("A-1", "2026-11-10", 1), [wl("A-1", "2026-11-10", 7200)])).toMatchObject({ state: "full", missing: 0 });
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
