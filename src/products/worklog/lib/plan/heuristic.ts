import type { Evt } from "@/shared/types";

/** Rough effort of a single event, used when AI is off or unavailable. */
export function eventScore(e: Evt): number {
  if (e.source === "jira") return 2;
  if (e.source === "git") return 1 + 1.5 * Math.log10(1 + e.weight);
  if (e.source === "gitlab") return Math.max(0.5, e.weight);
  // weight = minutes; a meeting only counts when its title carries a task key
  if (e.source === "calendar") return 0.5 + e.weight / 60;
  return 0.5;
}

export function heuristicWeights(events: Evt[], exclude: (key: string) => boolean = () => false): Record<string, number> {
  const w: Record<string, number> = {};
  for (const e of events) {
    if (!e.issueKey || exclude(e.issueKey)) continue;
    w[e.issueKey] = (w[e.issueKey] ?? 0) + eventScore(e);
  }
  return w;
}
