import { describe, expect, it } from "vitest";
import type { Roster } from "@/shared/types";
import { addPerson, addTeam, attachAccount, buildTree, emptyRoster, absenceNow, groupPeople, initials, ownerOf, removeTeam, unassigned } from "./roster";

function sample(): Roster {
  let r = addTeam(emptyRoster, null, "Development");
  r = addTeam(r, 1, "Backend");
  r = addTeam(r, 2, "API");
  r = addPerson(r, 2, "Dev", "dev");
  r = addPerson(r, 2, "Lead", "lead");
  r = addPerson(r, 3, "Tester", "qa");
  return r;
}

describe("roster", () => {
  it("builds the tree with depth and orders people by role", () => {
    const [root] = buildTree(sample());
    expect(root.team.name).toBe("Development");
    expect(root.children[0].children[0].depth).toBe(2);
    expect(root.children[0].people.map((p) => p.name)).toEqual(["Lead", "Dev"]);
  });

  it("removing a team removes its sub-teams and keeps the people without a team", () => {
    const r = removeTeam(sample(), 2);
    expect(r.teams.map((t) => t.name)).toEqual(["Development"]);
    expect(unassigned(r).map((p) => p.name).sort()).toEqual(["Dev", "Lead", "Tester"]);
  });

  it("gives new items fresh ids", () => {
    const r = removeTeam(sample(), 3);
    expect(addTeam(r, null, "QA").teams[2]?.id).toBe(3);
  });

  it("an account moves to the person it is attached to, ignoring case", () => {
    let r = attachAccount(sample(), 1, { system: "jira", extId: "Ann" });
    r = attachAccount(r, 2, { system: "jira", extId: "ann" });
    expect(r.people[0].accounts).toEqual([]);
    expect(ownerOf(r, "jira", "ANN")?.name).toBe("Lead");
    expect(ownerOf(r, "gitlab", "ann")).toBeUndefined();
  });

  it("ignores an empty account", () => {
    const r = sample();
    expect(attachAccount(r, 1, { system: "jira", extId: "  " })).toBe(r);
  });
});

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("anna petrova")).toBe("AP");
    expect(initials("Ivan Ivanovich Sidorov")).toBe("IS");
    expect(initials("Bob")).toBe("B");
    expect(initials("  ")).toBe("?");
  });
});

describe("groupPeople", () => {
  it("keeps the team lead apart from the dev/QA leads and drops empty blocks", () => {
    let r = addTeam(emptyRoster, null, "Department");
    r = addPerson(r, 1, "Team lead", "lead");
    r = addPerson(r, 1, "Dev lead", "devLead");
    r = addPerson(r, 1, "QA lead", "qaLead");
    r = addPerson(r, 1, "Dev", "dev");
    const g = groupPeople(buildTree(r)[0].people);
    expect(g.map((x) => x.group)).toEqual(["heads", "lead", "dev"]);
    expect(g[0].people.map((p) => p.name)).toEqual(["Dev lead", "QA lead"]);
  });
});

describe("absenceNow", () => {
  const person = (...a: [string, string][]) => ({ ...addPerson(emptyRoster, null, "A").people[0], absences: a.map(([from, to]) => ({ kind: "vacation" as const, from, to })) });
  it("finds the period that includes today, edges included", () => {
    const p = person(["2026-12-01", "2026-12-14"]);
    expect(absenceNow(p, "2026-12-01")?.current).toBe(true);
    expect(absenceNow(p, "2026-12-14")?.current).toBe(true);
    expect(absenceNow(p, "2026-12-15")).toBeNull();
  });
  it("announces a period starting soon, but not a far one", () => {
    const p = person(["2026-12-20", "2026-12-30"]);
    expect(absenceNow(p, "2026-12-10")?.current).toBe(false);
    expect(absenceNow(p, "2026-11-01")).toBeNull();
  });
  it("ignores a period with swapped dates", () => {
    expect(absenceNow(person(["2026-12-10", "2026-12-01"]), "2026-12-05")).toBeNull();
  });
});
