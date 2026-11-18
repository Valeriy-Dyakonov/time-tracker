import type { DashData, DashIssue } from "@/shared/types";

/**
 * Data from the cache or an older backend may lack fields added later (links, people...):
 * fill them so rendering never trips over a missing list.
 */
export function normalizeIssue(i: Partial<DashIssue> & { key: string }): DashIssue {
  return {
    summary: "", status: "", category: "new", priority: "", issueType: "", project: "", projectName: "",
    parent: null, epic: null, assignee: null, mine: false, updated: null, resolved: null, due: null,
    ...i,
    fixVersions: i.fixVersions ?? [],
    links: i.links ?? [],
    people: i.people ?? [],
  };
}

export function normalizeData(d: Partial<DashData> | null | undefined): DashData {
  const list = (x: unknown) => (Array.isArray(x) ? (x as (Partial<DashIssue> & { key: string })[]) : []).filter((i) => i && typeof i.key === "string");
  return {
    issues: list(d?.issues).map(normalizeIssue),
    context: list(d?.context).map(normalizeIssue),
    projects: Array.isArray(d?.projects) ? d!.projects : [],
  };
}
