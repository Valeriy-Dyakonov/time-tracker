import { describe, expect, it } from "vitest";
import { isDue, isLogged, parseTime } from "./reminder";

const at = (h: number, m: number) => new Date(2026, 10, 19, h, m);

describe("parseTime", () => {
  it("reads HH:MM only", () => {
    expect(parseTime("18:00")).toBe(1080);
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("soon")).toBeNull();
  });
});

describe("isDue", () => {
  it("is due from the hour for a while, once a day", () => {
    expect(isDue(at(17, 59), "18:00", null, "2026-11-19")).toBe(false);
    expect(isDue(at(18, 0), "18:00", null, "2026-11-19")).toBe(true);
    expect(isDue(at(20, 59), "18:00", null, "2026-11-19")).toBe(true);
    expect(isDue(at(21, 0), "18:00", null, "2026-11-19")).toBe(false);
    expect(isDue(at(18, 30), "18:00", "2026-11-19", "2026-11-19")).toBe(false);
    expect(isDue(at(18, 30), "18:00", "2026-11-18", "2026-11-19")).toBe(true);
    expect(isDue(at(18, 30), "oops", null, "2026-11-19")).toBe(false);
  });
});

describe("isLogged", () => {
  it("counts the day as logged when the norm is covered", () => {
    expect(isLogged(8 * 3600, 8)).toBe(true);
    expect(isLogged(8 * 3600 - 200, 8)).toBe(true);
    expect(isLogged(4 * 3600, 8)).toBe(false);
    expect(isLogged(0, 8)).toBe(false);
  });
});
