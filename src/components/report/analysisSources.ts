import type { SetupState } from "../../lib/setup";

type SourceFlag = "useGit" | "useGitlab" | "useConfluence" | "useCalendar" | "useMatrix" | "useAi";

export interface AnalysisSource {
  id: SourceFlag;
  label: string;
  /** Which settings section must be filled in before the source can be used. */
  setup: keyof SetupState;
  hint: string;
}

/** Optional sources the user can switch on and off before a run. Jira is always on. */
export const ANALYSIS_SOURCES: AnalysisSource[] = [
  { id: "useGit", label: "Git", setup: "git", hint: "Ваши коммиты в выбранных локальных репозиториях" },
  { id: "useGitlab", label: "GitLab", setup: "gitlab", hint: "Merge request'ы, которые вы создали, одобрили или комментировали" },
  { id: "useConfluence", label: "Confluence", setup: "confluence", hint: "Страницы и комментарии, которые вы создали или правили" },
  { id: "useCalendar", label: "Календарь", setup: "calendar", hint: "Встречи и звонки из Exchange: время и тема" },
  { id: "useMatrix", label: "Matrix", setup: "matrix", hint: "Ваши сообщения в рабочих чатах" },
  { id: "useAi", label: "Анализ ИИ", setup: "llm", hint: "Корпоративный ИИ решает, над какими задачами вы работали; без него — эвристика по ключам задач" },
];

export type SourceToggles = Record<SourceFlag, boolean>;

export const allSourcesOn = (): SourceToggles =>
  Object.fromEntries(ANALYSIS_SOURCES.map((s) => [s.id, true])) as SourceToggles;

/** A source is used only when the user left it on and it is configured. */
export function sourceFlags(toggles: SourceToggles, setup: SetupState): SourceToggles {
  return Object.fromEntries(ANALYSIS_SOURCES.map((s) => [s.id, toggles[s.id] && setup[s.setup]])) as SourceToggles;
}
