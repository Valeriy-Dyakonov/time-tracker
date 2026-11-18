import { describe, expect, it } from "vitest";
import type { JiraWorklog } from "@/shared/types";
import { filledDays, tempoActivity } from "./tempoDays";

const wl = (key: string, date: string, h: number, comment = ""): JiraWorklog => ({ id: `${key}${date}${h}`, key, date, seconds: h * 3600, comment });

describe("filledDays", () => {
  it("keeps only working days whose Tempo total reaches the norm", () => {
    const list = [wl("A-1", "2026-11-09", 5), wl("B-2", "2026-11-09", 3), wl("A-1", "2026-11-10", 6), wl("A-1", "2026-11-11", 7), wl("A-1", "2026-11-15", 8)];
    const norm = (d: string) => (d === "2026-11-11" ? 7 : 8);
    const days = filledDays(list, ["2026-11-09", "2026-11-10", "2026-11-11"], norm);
    expect([...days.keys()]).toEqual(["2026-11-09", "2026-11-11"]);
    expect(days.get("2026-11-09")?.map((w) => w.key)).toEqual(["A-1", "B-2"]);
  });
});

describe("tempoActivity", () => {
  it("weights tasks by logged minutes and keeps distinct descriptions", () => {
    const act = tempoActivity([wl("A-1", "2026-11-09", 5, "Built import"), wl("A-1", "2026-11-09", 1, "Built import"), wl("B-2", "2026-11-09", 2, "Review")]);
    expect(act.weights).toEqual({ "A-1": 360, "B-2": 120 });
    expect(act.notes).toEqual({ "A-1": ["Built import"], "B-2": ["Review"] });
  });
});
