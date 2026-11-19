import type { AbsenceKind, AccountSystem, Roster, RosterAbsence, RosterAccount, RosterPerson, RosterRole, RosterTeam } from "@/shared/types";

/** Order in which roles are listed inside a team. */
export const ROLES: RosterRole[] = ["lead", "dev", "qa", "devLead", "qaLead", "other"];
export const SYSTEMS: AccountSystem[] = ["jira", "gitlab", "matrix"];

export const emptyRoster: Roster = { teams: [], people: [] };

/** Next free id for a new team or person (ids are chosen here and stored as they are). */
export function nextId(items: { id: number }[]): number {
  return items.reduce((m, i) => Math.max(m, i.id), 0) + 1;
}

export interface TeamNode {
  team: RosterTeam;
  depth: number;
  people: RosterPerson[];
  children: TeamNode[];
}

const roleRank = (r: RosterRole) => ROLES.indexOf(r);

/** Teams as a forest in the saved order; people of a team by role, then in the saved order. */
export function buildTree(r: Roster): TeamNode[] {
  const byParent = new Map<number | null, RosterTeam[]>();
  for (const t of r.teams) {
    const list = byParent.get(t.parentId) ?? [];
    list.push(t);
    byParent.set(t.parentId, list);
  }
  const node = (team: RosterTeam, depth: number): TeamNode => ({
    team,
    depth,
    people: r.people.filter((p) => p.teamId === team.id).sort((a, b) => roleRank(a.role) - roleRank(b.role)),
    children: (byParent.get(team.id) ?? []).map((c) => node(c, depth + 1)),
  });
  return (byParent.get(null) ?? []).map((t) => node(t, 0));
}

/** People who are in no team. */
export const unassigned = (r: Roster): RosterPerson[] => r.people.filter((p) => p.teamId === null);

export function addTeam(r: Roster, parentId: number | null, name: string): Roster {
  return { ...r, teams: [...r.teams, { id: nextId(r.teams), parentId, name }] };
}

export function renameTeam(r: Roster, id: number, name: string): Roster {
  return { ...r, teams: r.teams.map((t) => (t.id === id ? { ...t, name } : t)) };
}

/** Removes the team with its sub-teams; their people stay in the roster without a team. */
export function removeTeam(r: Roster, id: number): Roster {
  const gone = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const t of r.teams) if (t.parentId !== null && gone.has(t.parentId) && !gone.has(t.id)) { gone.add(t.id); grew = true; }
  }
  return {
    teams: r.teams.filter((t) => !gone.has(t.id)),
    people: r.people.map((p) => (p.teamId !== null && gone.has(p.teamId) ? { ...p, teamId: null } : p)),
  };
}

export function addPerson(r: Roster, teamId: number | null, name: string, role: RosterRole = "dev"): Roster {
  return { ...r, people: [...r.people, { id: nextId(r.people), teamId, name, role, accounts: [], absences: [] }] };
}

export function updatePerson(r: Roster, id: number, patch: Partial<Pick<RosterPerson, "name" | "role" | "teamId">>): Roster {
  return { ...r, people: r.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function removePerson(r: Roster, id: number): Roster {
  return { ...r, people: r.people.filter((p) => p.id !== id) };
}

/** An account belongs to one person: attaching it to someone takes it from whoever had it. */
export function attachAccount(r: Roster, personId: number, account: RosterAccount): Roster {
  const extId = account.extId.trim();
  if (!extId) return r;
  const same = (a: RosterAccount) => a.system === account.system && a.extId.toLowerCase() === extId.toLowerCase();
  return {
    ...r,
    people: r.people.map((p) => {
      const rest = p.accounts.filter((a) => !same(a));
      return p.id === personId ? { ...p, accounts: [...rest, { system: account.system, extId }] } : { ...p, accounts: rest };
    }),
  };
}

export function detachAccount(r: Roster, personId: number, account: RosterAccount): Roster {
  return {
    ...r,
    people: r.people.map((p) =>
      p.id === personId ? { ...p, accounts: p.accounts.filter((a) => !(a.system === account.system && a.extId === account.extId)) } : p),
  };
}

/** Who holds an account in a system (comparison ignores case), for "already attached to ..." hints. */
export function ownerOf(r: Roster, system: AccountSystem, extId: string): RosterPerson | undefined {
  const id = extId.trim().toLowerCase();
  return r.people.find((p) => p.accounts.some((a) => a.system === system && a.extId.toLowerCase() === id));
}

/** Up to two capital letters for an avatar: "Anna Petrova" -> "AP". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] ?? "";
  const second = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] ?? "" : "";
  return (first + second).toUpperCase();
}

/** heads = dev lead and QA lead: they stand apart from the team (usually on the department card). */
export type RoleGroup = "heads" | "lead" | "dev" | "qa" | "other";
/** Blocks inside a team card, in display order. */
export const ROLE_GROUPS: RoleGroup[] = ["heads", "lead", "dev", "qa", "other"];
export const groupOf = (role: RosterRole): RoleGroup => (role === "devLead" || role === "qaLead" ? "heads" : role === "lead" ? "lead" : role === "dev" ? "dev" : role === "qa" ? "qa" : "other");

/** People of a team split into development / QA / other blocks; empty blocks are left out. */
export function groupPeople(people: RosterPerson[]): { group: RoleGroup; people: RosterPerson[] }[] {
  return ROLE_GROUPS.map((group) => ({ group, people: people.filter((p) => groupOf(p.role) === group) })).filter((g) => g.people.length);
}

export const ABSENCE_KINDS: AbsenceKind[] = ["vacation", "sick", "other"];

/** A new period starting today for a week. */
export function newAbsence(today: string): RosterAbsence {
  const d = new Date(today + "T00:00:00");
  d.setDate(d.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { kind: "vacation", from: today, to: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` };
}

export function setAbsences(r: Roster, personId: number, f: (list: RosterAbsence[]) => RosterAbsence[]): Roster {
  return { ...r, people: r.people.map((p) => (p.id === personId ? { ...p, absences: f(p.absences) } : p)) };
}

/** Days until the date, counted from today (YYYY-MM-DD, local). */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/**
 * What to show on the person: the period they are in right now, else the nearest one starting within `soon` days.
 * Periods with a wrong order of dates are ignored.
 */
export function absenceNow(p: RosterPerson, today: string, soon = 14): { absence: RosterAbsence; current: boolean } | null {
  const valid = p.absences.filter((a) => a.from && a.to && a.from <= a.to);
  const current = valid.find((a) => a.from <= today && today <= a.to);
  if (current) return { absence: current, current: true };
  const next = valid.filter((a) => a.from > today && daysBetween(today, a.from) <= soon).sort((a, b) => a.from.localeCompare(b.from))[0];
  return next ? { absence: next, current: false } : null;
}
