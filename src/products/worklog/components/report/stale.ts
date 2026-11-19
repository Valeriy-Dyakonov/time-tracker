import type { Analysis, FillMode } from "@/shared/types";

export type Stale = null | "period" | "calls";

interface Chosen { start: string; end: string; hours: number; fillMode: FillMode }

/**
 * Why the result on screen no longer matches what is chosen: another period or norm was picked, or the
 * calls were changed after the run. Results are shown only when this is null.
 */
export function staleReason(a: Analysis | null, chosen: Chosen, callsChanged: boolean): Stale {
  if (!a) return null;
  if (a.start !== chosen.start || a.end !== chosen.end || a.hoursPerDay !== chosen.hours || a.fillMode !== chosen.fillMode) return "period";
  return callsChanged ? "calls" : null;
}
