import type { DayProgress, Evt, FillMode, IssueInfo, LogEntry, LogLevel, Meeting, Settings } from "../../types";
import type { IssueEnricher } from "./enrich";

export interface RunOptions {
  start: string;
  end: string;
  hoursPerDay: number;
  useJira: boolean;
  useGit: boolean;
  useGitlab: boolean;
  useMatrix: boolean;
  useConfluence: boolean;
  useCalendar: boolean;
  useAi: boolean;
  fillMode: FillMode;
}

export interface RunHandlers {
  onLog: (e: LogEntry) => void;
  onDays: (d: DayProgress[]) => void;
}

/** Shared state of one analysis run, passed to every stage. */
export interface RunContext {
  settings: Settings;
  o: RunOptions;
  issues: Record<string, IssueInfo>;
  events: Evt[];
  meetings: Meeting[];
  warnings: string[];
  /** Norm per date where it differs from `o.hoursPerDay` (shortened pre-holiday days). */
  targets: Record<string, number>;
  aiOn: boolean;
  isCtx: (key: string) => boolean;
  log: (level: LogLevel, msg: string) => void;
  enrich: IssueEnricher;
}

export const normFor = (ctx: RunContext, date: string): number => ctx.targets[date] ?? ctx.o.hoursPerDay;
