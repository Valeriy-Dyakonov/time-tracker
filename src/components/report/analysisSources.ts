import type { SetupState } from "../../lib/setup";
import type { Source } from "../../types";

export type SourceFlag = "useGit" | "useGitlab" | "useConfluence" | "useCalendar" | "useMatrix" | "useAi";

export interface AnalysisSource {
  id: SourceFlag;
  /** Key of the label in `common.sources`. */
  label: Source | "ai";
  /** Which settings section must be filled in before the source can be used. */
  setup: keyof SetupState;
}

/** Optional sources the user can switch on and off before a run. Jira is always on. */
export const ANALYSIS_SOURCES: AnalysisSource[] = [
  { id: "useGit", label: "git", setup: "git" },
  { id: "useGitlab", label: "gitlab", setup: "gitlab" },
  { id: "useConfluence", label: "confluence", setup: "confluence" },
  { id: "useCalendar", label: "calendar", setup: "calendar" },
  { id: "useMatrix", label: "matrix", setup: "matrix" },
  { id: "useAi", label: "ai", setup: "llm" },
];

export type SourceToggles = Record<SourceFlag, boolean>;

export const allSourcesOn = (): SourceToggles =>
  Object.fromEntries(ANALYSIS_SOURCES.map((s) => [s.id, true])) as SourceToggles;

/** A source is used only when the user left it on and it is configured. */
export function sourceFlags(toggles: SourceToggles, setup: SetupState): SourceToggles {
  return Object.fromEntries(ANALYSIS_SOURCES.map((s) => [s.id, toggles[s.id] && setup[s.setup]])) as SourceToggles;
}
