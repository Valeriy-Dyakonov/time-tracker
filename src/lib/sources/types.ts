import type { RunContext } from "../analysis/types";

/** One place the user's activity is read from (Strategy): the pipeline only knows this interface. */
export interface SourceCollector {
  /** Prefix of log lines and warnings: "Git", "Календарь". */
  name: string;
  step: string;
  enabled(ctx: RunContext): boolean;
  /** Log line when the source is not used. */
  skipped: string;
  /** A failing required source aborts the run; others only add a warning. */
  required?: boolean;
  /** Reads the source and adds its events (and issues, meetings) to the context. */
  collect(ctx: RunContext): Promise<void>;
}
