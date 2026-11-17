import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setLocale } from "../i18n";
import {
  attachKeys,
  buildPlan,
  distribute,
  fillerNote,
  statusOnDate,
  heuristicWeights,
  isPlausibleKey,
  isWorkMessage,
  projectOf,
  rebalance,
  workDates,
  type DayActivity,
} from "./allocate";
import type { Analysis, DayPlan, Evt } from "../types";
import { weeksOf } from "./report";
import { fmtTempo, weekText, worklogRows } from "./submit";

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

// Expected texts below are the Russian wording; the English catalog is checked at the end.
beforeAll(() => setLocale("ru"));
afterAll(() => setLocale("ru"));

describe("distribute", () => {
  it("always sums to the total, in 0.25 steps", () => {
    for (const w of <Record<string, number>[]>[
      { A: 1, B: 1, C: 1 },
      { A: 0.7, B: 0.2, C: 0.1 },
      { A: 5, B: 0.01 },
      { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1, G: 1 },
    ]) {
      const r = distribute(w, 8);
      expect(sum(r)).toBeCloseTo(8, 10);
      for (const h of Object.values(r)) expect(h % 0.25).toBe(0);
    }
  });
  it("drops zero / negative / NaN weights and handles empty input", () => {
    expect(distribute({ A: 0, B: -1, C: NaN }, 8)).toEqual({});
    expect(distribute({ A: 1, B: 0 }, 8)).toEqual({ A: 8 });
    expect(distribute({}, 8)).toEqual({});
  });
  it("splits evenly", () => {
    expect(distribute({ A: 1, B: 1 }, 8)).toEqual({ A: 4, B: 4 });
  });
});

describe("attachKeys", () => {
  const e = (text: string, context: string | null = null): Evt => ({
    source: "git", ts: 0, issueKey: null, text, context, weight: 1,
  });
  it("finds keys in text, then in branch/room", () => {
    const r = attachKeys([e("PROJ-12 fix"), e("wip", "feature/ABC-7-x"), e("nothing")]);
    expect(r.map((x) => x.issueKey)).toEqual(["PROJ-12", "ABC-7", null]);
  });
});

describe("isWorkMessage", () => {
  it("drops small talk, keeps work messages", () => {
    expect(isWorkMessage("ок")).toBe(false);
    expect(isWorkMessage("спасибо!")).toBe(false);
    expect(isWorkMessage("👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍")).toBe(false);
    expect(isWorkMessage("посмотри PAY-12")).toBe(true);
    expect(isWorkMessage("надо поправить округление в модуле возвратов до релиза")).toBe(true);
  });
});

describe("context projects", () => {
  it("excludes keys from heuristic weights", () => {
    const mk = (k: string): Evt => ({ source: "jira", ts: 0, issueKey: k, text: "", context: null, weight: 1 });
    expect(heuristicWeights([mk("ABC-1"), mk("PAY-1")], (k) => projectOf(k) === "ABC")).toEqual({ "PAY-1": 2 });
  });
});

describe("isPlausibleKey", () => {
  it("keeps real-looking project keys, drops well-known non-tasks", () => {
    expect(["XYZ-25869", "PAY-1", "A1-5"].every(isPlausibleKey)).toBe(true);
    expect(["UTF-8", "SHA-256", "RFC-2616", "CVE-2024"].some(isPlausibleKey)).toBe(false);
  });
});

describe("heuristicWeights", () => {
  it("ignores events without key", () => {
    const mk = (k: string | null): Evt => ({ source: "jira", ts: 0, issueKey: k, text: "", context: null, weight: 1 });
    expect(heuristicWeights([mk("A-1"), mk("A-1"), mk(null)])).toEqual({ "A-1": 4 });
  });
});

describe("buildPlan", () => {
  const act = (w: Record<string, number>): DayActivity => ({ weights: w, notes: {}, summary: "", reasoning: "", evidence: [], eventCount: 1 });
  it("fills every day to the target and infers empty days", () => {
    const dates = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
    const plan = buildPlan(dates, { "2026-11-03": act({ "A-1": 1, "B-2": 1 }) }, {}, 8);
    expect(plan.map((d) => d.basis)).toEqual(["inferred", "activity", "inferred", "inferred"]);
    expect(plan[0].inferredFrom).toBe("2026-11-03"); // only a later day exists
    expect(plan[2].inferredFrom).toBe("2026-11-03"); // previous wins
    for (const d of plan) expect(d.tasks.reduce((s, t) => s + t.hours, 0)).toBe(8);
  });
  it("leaves days empty when there is no activity anywhere", () => {
    const plan = buildPlan(["2026-11-02"], {}, {}, 8);
    expect(plan[0].basis).toBe("empty");
    expect(plan[0].tasks).toEqual([]);
  });
});

describe("buildPlan fill modes", () => {
  const act = (w: Record<string, number>): DayActivity => ({ weights: w, notes: {}, summary: "", reasoning: "r", evidence: [], eventCount: 1 });
  const dates = ["2026-11-02", "2026-11-03", "2026-11-04"];
  const activity = { "2026-11-02": act({ A: 3, B: 1 }), "2026-11-04": act({ C: 1 }) };
  it("period mode mixes all active days equally and explains itself", () => {
    const d = buildPlan(dates, activity, {}, 8, "period")[1];
    expect(d.basis).toBe("inferred");
    expect(d.tasks.reduce((s, t) => s + t.hours, 0)).toBe(8);
    expect(d.tasks.map((t) => t.key).sort()).toEqual(["A", "B", "C"]);
    expect(d.reasoning).toContain("всего периода");
  });
  it("none mode leaves gaps empty", () => {
    const d = buildPlan(dates, activity, {}, 8, "none")[1];
    expect(d.basis).toBe("empty");
    expect(d.tasks).toEqual([]);
  });
  it("neighbors mode names the source day in the reasoning", () => {
    const d = buildPlan(dates, activity, {}, 8, "neighbors")[1];
    expect(d.reasoning).toContain("02.11");
  });
});

describe("rebalance", () => {
  it("rescales edited hours back to target", () => {
    const d = rebalance({
      date: "2026-11-02", target: 8, off: false, basis: "activity", summary: "", reasoning: "", evidence: [], meetings: [], eventCount: 0,
      tasks: [{ key: "A", hours: 2, notes: [] }, { key: "B", hours: 2, notes: [] }],
    });
    expect(d.tasks.map((t) => t.hours)).toEqual([4, 4]);
  });
});

describe("workDates", () => {
  it("skips weekends and future days", () => {
    expect(workDates("2026-11-09", "2026-11-17", [1, 2, 3, 4, 5], "2026-11-12"))
      .toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
  });
});

describe("submit helpers", () => {
  it("formats Tempo hours", () => {
    expect(fmtTempo(2.5, "hm")).toBe("2h 30m");
    expect(fmtTempo(8, "hm")).toBe("8h");
    expect(fmtTempo(0.25, "hm")).toBe("15m");
    expect(fmtTempo(2.25, "decimal")).toBe("2.25");
  });
  it("builds week text and rows", () => {
    const day = (date: string, key: string, h: number, summary: string): DayPlan => ({
      date, target: 8, tasks: [{ key, hours: h, notes: [] }], summary, basis: "activity", off: false, eventCount: 1, reasoning: "", evidence: [], meetings: [],
    });
    const a = { start: "2026-11-02", end: "2026-11-08", hoursPerDay: 8, jiraUrl: "", days: [day("2026-11-02", "PAY-1", 8, "Правки клиента"), day("2026-11-03", "PAY-1", 8, "Тесты")], issues: { "PAY-1": { key: "PAY-1", summary: "Шлюз", status: "", issueType: "" } }, warnings: [], usedAi: false, narrative: "", fillMode: "none", log: [] } as unknown as Analysis;
    expect(worklogRows(a)).toHaveLength(2);
    const w = weeksOf(a.days)[0];
    expect(weekText(a, w)).toBe("• PAY-1 Шлюз — 16 ч: Правки клиента; Тесты");
  });
});

describe("filling days without data", () => {
  const act = (w: Record<string, number>): DayActivity => ({ weights: w, notes: {}, summary: "s", reasoning: "r", evidence: [], eventCount: 3 });
  const issue = (key: string, extra: object = {}) => ({ key, summary: `Задача ${key}`, status: "In Progress", issueType: "Task", ...extra });

  it("skips tasks that did not exist yet and writes neutral, varied descriptions", () => {
    const created = new Date(2026, 10, 5).getTime();
    const issues = { "A-1": issue("A-1"), "B-1": issue("B-1", { created }) };
    const plan = buildPlan(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"], { "2026-11-02": act({ "A-1": 1, "B-1": 1 }) }, issues, 8, "neighbors");
    expect(plan[0].basis).toBe("activity");
    // 03 and 04 Nov: B-1 is created only on 05 Nov
    expect(plan[1].tasks.map((t) => t.key)).toEqual(["A-1"]);
    expect(plan[1].tasks[0].hours).toBe(8);
    expect(plan[2].tasks.map((t) => t.key)).toEqual(["A-1"]);
    expect(plan[3].tasks.map((t) => t.key).sort()).toEqual(["A-1", "B-1"]);
    for (const d of plan.slice(1)) expect(d.tasks.every((t) => t.notes[0]?.length > 10)).toBe(true);
    expect(plan[1].tasks[0].notes[0]).not.toBe(plan[2].tasks[0].notes[0]); // consecutive days are worded differently
  });

  it("uses the epic title in the wording when known", () => {
    const issues = { "A-1": issue("A-1", { epic: "E-1" }), "E-1": issue("E-1", { summary: "Платежи 2.0" }) };
    const notes = new Set(Array.from({ length: 8 }, (_, n) => fillerNote("A-1", n, issues)));
    expect([...notes].some((x) => x.includes("Платежи 2.0"))).toBe(true);
  });
});

describe("filler wording follows the task stage", () => {
  const ev = (source: "git" | "jira", key: string, text: string) => ({ ts: 0, source, key, text });
  const act = (key: string, evidence: ReturnType<typeof ev>[]): DayActivity => ({ weights: { [key]: 1 }, notes: {}, summary: "s", reasoning: "r", evidence, eventCount: evidence.length });
  const issues = { "A-1": { key: "A-1", summary: "Задача", status: "In Progress", issueType: "Task" } };
  const QA = /Тестирован|QA|окружения|стенд|релиз|инфраструктур|Проверка|проверка результата/;

  it("after the last commit it is testing and QA support, before the first commit it is analysis", () => {
    const plan = buildPlan(
      ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"],
      { "2026-11-03": act("A-1", [ev("git", "A-1", "[r] fix")]) },
      issues, 8, "neighbors",
    );
    expect(plan[0].tasks[0].notes[0]).toMatch(/Анализ|Проработка|Изучение|Обсуждение|Планирование/); // 02.11: before any commit
    expect(plan[2].tasks[0].notes[0]).toMatch(QA); // 04.11: after the only commit
    expect(plan[4].tasks[0].notes[0]).toMatch(QA);
    expect(plan[2].reasoning).toContain("после разработки");
  });

  it("a status change to Testing switches the stage to QA", () => {
    const plan = buildPlan(
      ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"],
      {
        "2026-11-02": act("A-1", [ev("git", "A-1", "[r] feat")]),
        "2026-11-03": act("A-1", [ev("jira", "A-1", "status: In Progress → Testing")]),
        "2026-11-05": act("A-1", [ev("git", "A-1", "[r] more")]),
      },
      issues, 8, "neighbors",
    );
    expect(plan[2].tasks[0].notes[0]).toMatch(QA); // 04.11: status was Testing on 03.11
  });
});

describe("status history", () => {
  const day = (s: string) => new Date(`${s}T12:00:00`).getTime();
  const issue = { key: "A-1", summary: "Задача", status: "Testing", issueType: "Task", transitions: [
    { ts: day("2026-11-02"), from: "To Do", to: "In Progress", byMe: true },
    { ts: day("2026-11-04"), from: "In Progress", to: "Testing", byMe: false },
  ] };
  it("knows the status on a given day", () => {
    expect(statusOnDate(issue, "2026-11-01")).toBe("To Do");
    expect(statusOnDate(issue, "2026-11-03")).toBe("In Progress");
    expect(statusOnDate(issue, "2026-11-05")).toBe("Testing");
    expect(statusOnDate({ ...issue, transitions: [] }, "2026-11-05")).toBeUndefined();
  });
  it("a status change made by someone else switches filler wording to QA", () => {
    const act: DayActivity = { weights: { "A-1": 1 }, notes: {}, summary: "s", reasoning: "r", eventCount: 1, evidence: [{ ts: 0, source: "git", key: "A-1", text: "[r] x" }] };
    const plan = buildPlan(["2026-11-03", "2026-11-04", "2026-11-05"], { "2026-11-03": act, "2026-11-05": { ...act } }, { "A-1": issue }, 8, "neighbors");
    expect(plan[1].tasks[0].notes[0]).toMatch(/Тестирован|QA|окружения|стенд|релиз|инфраструктур|Проверка|проверка результата/); // 04.11: moved to Testing, although commits continue after
  });
});

describe("production calendar", () => {
  it("skips holidays and adds transferred working Saturdays", () => {
    const d = workDates("2026-11-02", "2026-11-08", [1, 2, 3, 4, 5], "2026-12-01", { off: new Set(["2026-11-04"]), extra: new Set(["2026-11-07"]) });
    expect(d).toEqual(["2026-11-02", "2026-11-03", "2026-11-05", "2026-11-06", "2026-11-07"]);
  });
  it("uses a shorter norm on pre-holiday days", () => {
    const act = { "2026-11-03": { weights: { "A-1": 1 }, notes: {}, summary: "", reasoning: "", eventCount: 1, evidence: [] } } as never;
    const plan = buildPlan(["2026-11-02", "2026-11-03"], act, {}, 8, "neighbors", {}, { "2026-11-03": 7 });
    expect(plan.map((p) => [p.target, p.tasks.reduce((s, t) => s + t.hours, 0)])).toEqual([[8, 8], [7, 7]]);
  });
});

describe("English wording", () => {
  beforeAll(() => setLocale("en"));
  afterAll(() => setLocale("ru"));

  it("formats hours with a dot and writes stage-aware filler notes in English", async () => {
    const { fmtH } = await import("./report");
    expect(fmtH(7.5)).toBe("7.5");
    const issues = { "A-1": { key: "A-1", summary: "Task", status: "In Progress", issueType: "Task" } };
    const note = fillerNote("A-1", 0, issues, "qa");
    expect(note).toMatch(/Testing|QA|environment|stand|release|infrastructure|Checking|verifying/);
    expect(note).not.toMatch(/[А-Яа-яЁё]/);
  });

  it("explains inferred days in English", () => {
    const act = { weights: { "A-1": 1 }, notes: {}, summary: "s", reasoning: "r", evidence: [], eventCount: 1 };
    const issues = { "A-1": { key: "A-1", summary: "Task", status: "In Progress", issueType: "Task" } };
    const plan = buildPlan(["2026-11-02", "2026-11-03"], { "2026-11-02": act }, issues, 8, "neighbors");
    expect(plan[1].reasoning).toContain("Taken from the previous day with activity");
    expect(plan[1].reasoning).not.toMatch(/[А-Яа-яЁё]/);
  });
});
