import type { Evidence } from "../../types";

/** What the analysis of one day produced, before hours are distributed. */
export interface DayActivity {
  weights: Record<string, number>;
  notes: Record<string, string[]>;
  summary: string;
  reasoning: string;
  evidence: Evidence[];
  eventCount: number;
}
