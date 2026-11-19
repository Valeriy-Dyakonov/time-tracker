import { describe, expect, it } from "vitest";
import { normalizeData } from "./normalize";

describe("normalizeData", () => {
  it("fills lists missing in data saved by an older version", () => {
    const d = normalizeData({ issues: [{ key: "A-1", summary: "Old" } as never], context: undefined });
    expect(d.issues[0]).toMatchObject({ key: "A-1", summary: "Old", links: [], people: [], fixVersions: [], assignee: null });
    expect(d.context).toEqual([]);
    expect(d.projects).toEqual([]);
  });

  it("survives garbage", () => {
    expect(normalizeData(null)).toEqual({ issues: [], context: [], projects: [], cachedAt: 0 });
    expect(normalizeData({ issues: [null, { nokey: 1 }] as never }).issues).toEqual([]);
  });
});
