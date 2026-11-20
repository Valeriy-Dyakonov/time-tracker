import { describe, expect, it } from "vitest";
import type { Mr, Roster } from "@/shared/types";
import { buildMessage, recipientsOf } from "./share";

const mr = (iid: number, title: string): Mr => ({
  projectId: 1, iid, project: "g/app", title, url: `https://git.co/g/app/-/merge_requests/${iid}`, sourceBranch: "f", targetBranch: "main",
  task: null, author: { username: "me", name: "Me" }, draft: false, conflicts: false, discussionsResolved: true, mergeStatus: "can_be_merged",
  comments: 0, created: 0, updated: 0, reviewers: [], approvedBy: [], approvalsLeft: null, detailed: false, pipeline: null,
});

const roster: Roster = {
  teams: [],
  people: [
    { id: 1, teamId: null, name: "Пётр Петров", role: "dev", accounts: [{ system: "matrix", extId: "@petrov:hs.ru" }, { system: "gitlab", extId: "petrov" }], absences: [] },
    { id: 2, teamId: null, name: "Анна Орлова", role: "qa", accounts: [{ system: "gitlab", extId: "Me" }], absences: [] },
    { id: 3, teamId: null, name: "Борис", role: "dev", accounts: [{ system: "matrix", extId: "not-an-id" }], absences: [] },
  ],
};

describe("recipientsOf", () => {
  it("leaves out the user, sorts by name and keeps only real Matrix IDs", () => {
    expect(recipientsOf(roster, "me")).toEqual([
      { id: 3, name: "Борис", matrixId: null },
      { id: 1, name: "Пётр Петров", matrixId: "@petrov:hs.ru" },
    ]);
    expect(recipientsOf(roster, "")).toHaveLength(3);
  });
});

describe("buildMessage", () => {
  const list = [mr(1, "ABC-1 [import] fix"), mr(2, "ABC-2 export")];
  const to = recipientsOf(roster, "me");
  const line = " Look: ";

  it("writes Matrix markdown with mention links", () => {
    expect(buildMessage("matrix", list, to, line)).toBe(
      "Борис, [Пётр Петров](https://matrix.to/#/@petrov:hs.ru)\nLook:\n\n" +
        "- [ABC-1 \\[import\\] fix](https://git.co/g/app/-/merge_requests/1)\n" +
        "- [ABC-2 export](https://git.co/g/app/-/merge_requests/2)",
    );
  });
  it("writes Slack links and plain text", () => {
    expect(buildMessage("slack", [mr(2, "a|b")], [], line)).toBe("Look:\n\n• <https://git.co/g/app/-/merge_requests/2|ab>");
    expect(buildMessage("text", [mr(2, "ABC-2 export")], to, line)).toBe(
      "Борис, Пётр Петров\nLook:\n\n- ABC-2 export — https://git.co/g/app/-/merge_requests/2",
    );
  });
});
