import { describe, expect, it } from "vitest";
import type { WorklogRow } from "./submit";
import { applyEdits, checkNewRow, NO_EDITS, parseHours, removeRow, restoreRow, setHours } from "./submitEdits";

const row = (key: string, date: string, hours: number): WorklogRow => ({ key, date, hours, comment: "c", inferred: false });
const plan = [row("A-1", "2026-11-10", 4), row("A-2", "2026-11-10", 4)];

describe("parseHours", () => {
  it("understands the usual ways to type hours", () => {
    expect(parseHours("2h 30m")).toBe(2.5);
    expect(parseHours("2ч 30м")).toBe(2.5);
    expect(parseHours("2,5")).toBe(2.5);
    expect(parseHours("2:30")).toBe(2.5);
    expect(parseHours("90m")).toBe(1.5);
    expect(parseHours("3h")).toBe(3);
  });

  it("rejects nonsense, zero and more than a day", () => {
    for (const s of ["", "abc", "0", "25", "2h abc"]) expect(parseHours(s)).toBeNull();
  });
});

describe("edits", () => {
  it("overrides hours, removes and adds rows, and remembers the planned hours", () => {
    let e = setHours(NO_EDITS, { ...plan[0], origin: "plan" }, 6);
    e = removeRow(e, { ...plan[1], origin: "plan" });
    e = { ...e, added: [row("B-7", "2026-11-11", 1)] };
    const rows = applyEdits(plan, e);
    expect(rows.map((r) => [r.key, r.hours, r.origin, r.planHours])).toEqual([
      ["A-1", 6, "plan", 4],
      ["B-7", 1, "added", undefined],
    ]);
    expect(applyEdits(plan, restoreRow(e, "A-2|2026-11-10")).map((r) => r.key)).toEqual(["A-1", "A-2", "B-7"]);
  });

  it("drops the override when hours are set back to the plan", () => {
    const edited = applyEdits(plan, setHours(NO_EDITS, { ...plan[0], origin: "plan" }, 6))[0];
    expect(setHours({ ...NO_EDITS, hours: { "A-1|2026-11-10": 6 } }, edited, 4).hours).toEqual({});
  });

  it("forgets an added row on remove", () => {
    const e = { ...NO_EDITS, added: [row("B-7", "2026-11-11", 1)] };
    expect(removeRow(e, { ...e.added[0], origin: "added" }).added).toEqual([]);
  });

  it("validates a new row", () => {
    const cur = applyEdits(plan, NO_EDITS);
    const ok = { key: "B-7", date: "2026-11-11", hours: 1 };
    expect(checkNewRow(ok, "2026-11-10", "2026-11-14", cur)).toBeNull();
    expect(checkNewRow({ ...ok, key: "b7" }, "2026-11-10", "2026-11-14", cur)).toBe("key");
    expect(checkNewRow({ ...ok, date: "2026-11-20" }, "2026-11-10", "2026-11-14", cur)).toBe("date");
    expect(checkNewRow({ ...ok, hours: null }, "2026-11-10", "2026-11-14", cur)).toBe("hours");
    expect(checkNewRow({ ...ok, key: "A-1", date: "2026-11-10" }, "2026-11-10", "2026-11-14", cur)).toBe("exists");
  });
});
