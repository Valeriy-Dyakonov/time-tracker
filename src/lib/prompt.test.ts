import { describe, expect, it } from "vitest";
import { setLocale } from "../i18n";
import { parseAiDay } from "./prompt";

const allowed = new Set(["A-1", "B-2"]);

describe("parseAiDay", () => {
  it("parses fenced JSON and drops unknown keys / bad weights", () => {
    const raw = "```json\n" + JSON.stringify({
      tasks: [
        { key: "A-1", weight: 0.6, note: "делал X" },
        { key: "ZZ-9", weight: 1 },
        { key: "B-2", weight: "abc" },
        { key: "B-2", weight: -1 },
      ],
      summary: " Работал над X ",
    }) + "\n```";
    expect(parseAiDay(raw, allowed)).toEqual({
      weights: { "A-1": 0.6 },
      notes: { "A-1": ["делал X"] },
      summary: "Работал над X",
      reasoning: "",
    });
  });
  it("returns null for garbage or when nothing valid is left", () => {
    expect(parseAiDay("sorry, no", allowed)).toBeNull();
    // valid JSON with nothing usable is a legitimate "no matching task" answer, not a parse failure
    expect(parseAiDay('{"tasks":[{"key":"ZZ-9","weight":1}],"reasoning":"ничего не подошло"}', allowed))
      .toEqual({ weights: {}, notes: {}, summary: "", reasoning: "ничего не подошло" });
    expect(parseAiDay('{"tasks":[]}', allowed)?.weights).toEqual({});
    expect(parseAiDay('{"nope":1}', allowed)).toBeNull();
  });
});

import { parseNarrative } from "./prompt";
describe("parseAiDay reasoning / parseNarrative", () => {
  it("keeps the reasoning text", () => {
    const r = parseAiDay('{"tasks":[{"key":"A-1","weight":1}],"reasoning":" Потому что коммиты "}', allowed);
    expect(r?.reasoning).toBe("Потому что коммиты");
  });
  it("parses JSON or plain narrative, rejects junk", () => {
    expect(parseNarrative('{"text":" Итог "}')).toBe("Итог");
    expect(parseNarrative("Просто текст")).toBe("Просто текст");
    expect(parseNarrative("{}")).toBeNull();
  });
});

import { dayPrompt, narrativeSystemPrompt } from "./prompt";
describe("system prompts follow the interface language", () => {
  it("asks for Russian or English output", () => {
    setLocale("ru");
    expect(dayPrompt()).toContain("Пиши по-русски");
    expect(narrativeSystemPrompt()).toContain("русским языком");
    setLocale("en");
    expect(dayPrompt()).toContain("Write in English");
    expect(narrativeSystemPrompt()).toContain("English");
    setLocale("ru");
  });
});
