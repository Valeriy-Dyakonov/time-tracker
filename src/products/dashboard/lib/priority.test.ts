import { describe, expect, it } from "vitest";
import { priorityLevel } from "./priority";

describe("priorityLevel", () => {
  it("reads the level from usual names", () => {
    expect(["Blocker", "Highest", "Критический"].map(priorityLevel)).toEqual(["top", "top", "top"]);
    expect(["High", "Major", "Высокий"].map(priorityLevel)).toEqual(["high", "high", "high"]);
    expect(["Medium", "Normal", "Средний"].map(priorityLevel)).toEqual(["mid", "mid", "mid"]);
    expect(["Low", "Lowest", "Trivial", "Низкий"].map(priorityLevel)).toEqual(["low", "low", "low", "low"]);
  });
});
