import { describe, expect, it } from "vitest";
import type { Analysis, DayPlan, JiraWorklog } from "../types";
import type { Week } from "./report";
import { tempoDayBlocks, tempoReadiness, tempoWeekTasks } from "./tempoWeek";

const day = (date: string, target: number, off = false) => ({ date, target, off, tasks: [] }) as unknown as DayPlan;
const week: Week = { monday: "2026-11-09", sunday: "2026-11-15", total: 16, days: [day("2026-11-09", 8), day("2026-11-10", 8), day("2026-11-14", 0, true)] };
const wl = (key: string, date: string, h: number, comment = "", id = `${key}${date}${h}`): JiraWorklog => ({ id, key, date, seconds: h * 3600, comment });

describe("tempoReadiness", () => {
  it("is ready only when every working day has its norm logged", () => {
    const full = [wl("A-1", "2026-11-09", 8), wl("A-1", "2026-11-10", 5), wl("B-2", "2026-11-10", 3)];
    expect(tempoReadiness(week, full)).toEqual({ ready: true, logged: 960, norm: 960 });
    const short = [wl("A-1", "2026-11-09", 8), wl("A-1", "2026-11-10", 7), wl("A-1", "2026-11-16", 9)];
    expect(tempoReadiness(week, short)).toMatchObject({ ready: false, logged: 900 });
  });
});

describe("tempoWeekTasks", () => {
  it("sums the week per task with distinct descriptions in date order", () => {
    const list = [wl("A-1", "2026-11-10", 2, "Fixed import"), wl("A-1", "2026-11-09", 6, "Built import"), wl("A-1", "2026-11-11", 1, "Fixed import"), wl("B-2", "2026-11-10", 3)];
    expect(tempoWeekTasks(week, list)).toEqual([
      { key: "A-1", minutes: 540, said: ["Built import", "Fixed import"] },
      { key: "B-2", minutes: 180, said: [] },
    ]);
  });
});

describe("tempoDayBlocks", () => {
  it("gives one block per day with worklogs, in date order, with that day's tasks only", () => {
    const a = { issues: {} } as unknown as Analysis;
    const list = [wl("B-2", "2026-11-10", 3, "Review"), wl("A-1", "2026-11-09", 8, "Built import"), wl("A-1", "2026-11-10", 5, "Fixed import")];
    const blocks = tempoDayBlocks(a, week, list);
    expect(blocks.map((b) => [b.date, b.hours, b.text.split("\n").length])).toEqual([["2026-11-09", 8, 1], ["2026-11-10", 8, 2]]);
    expect(blocks[1].text).toContain("Fixed import");
    expect(blocks[1].text).not.toContain("Built import");
  });
});
