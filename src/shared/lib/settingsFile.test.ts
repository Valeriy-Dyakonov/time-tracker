import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/shared/types";
import { exportSettings, importSettings, PERSONAL } from "./settingsFile";

describe("settings file", () => {
  it("round-trips", () => {
    const s = { ...defaultSettings, jiraUrl: "https://j", hoursPerDay: 6, callsTaskKey: "P-1" };
    expect(importSettings(exportSettings(s))?.settings).toEqual(s);
  });

  it("leaves personal fields out of the file and keeps them on import", () => {
    const mine = { ...defaultSettings, jiraUrl: "https://j", matrixUserId: "@me:x", exchangeUser: "me", gitRoot: "C:/w", gitRepos: ["r"], gitAuthors: ["a"], matrixExcludeRooms: ["!r"] };
    const file = exportSettings(mine);
    for (const k of PERSONAL) expect(file).not.toContain(`"${k}"`);
    const other = { ...defaultSettings, matrixUserId: "@you:x", gitRepos: ["q"] };
    const r = importSettings(file, other)!.settings;
    expect(r.jiraUrl).toBe("https://j");
    expect(r.matrixUserId).toBe("@you:x");
    expect(r.gitRepos).toEqual(["q"]);
  });

  it("skips unknown and mistyped fields, fills missing ones from defaults", () => {
    const text = JSON.stringify({ format: "worklog-tracker-settings", settings: { jiraUrl: 5, hoursPerDay: 6, bogus: 1, workdays: ["x"] } });
    const r = importSettings(text)!;
    expect(r.settings.hoursPerDay).toBe(6);
    expect(r.settings.jiraUrl).toBe(defaultSettings.jiraUrl);
    expect(r.settings.workdays).toEqual(defaultSettings.workdays);
    expect(r.skipped.sort()).toEqual(["bogus", "jiraUrl", "workdays"]);
  });

  it("rejects other files", () => {
    expect(importSettings("nope")).toBeNull();
    expect(importSettings("{}")).toBeNull();
  });
});
