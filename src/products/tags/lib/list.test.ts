import { describe, expect, it } from "vitest";
import type { ServiceTags } from "@/shared/types";
import { tagsText } from "./list";

const tag = (name: string, branches: string[]) => ({ name, created: 0, sha: "", message: "", branches, url: "" });

describe("tagsText", () => {
  it("writes service - branch - tag per line", () => {
    const list: ServiceTags[] = [
      { project: "g/api", url: "", error: null, tags: [tag("v1.2", ["main", "release/1.2"]), tag("v1.1", ["main"])] },
      { project: "g/web", url: "", error: null, tags: [tag("v3", [])] },
    ];
    expect(tagsText(list)).toBe("g/api - main, release/1.2 - v1.2\ng/api - main - v1.1\ng/web - v3");
  });
});
