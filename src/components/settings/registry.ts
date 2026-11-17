import type { ComponentType } from "react";
import type { SetupState } from "../../lib/setup";
import type { Settings } from "../../types";
import { CalendarSection } from "./sections/CalendarSection";
import { ConfluenceSection } from "./sections/ConfluenceSection";
import { GitlabSection } from "./sections/GitlabSection";
import { GitSection } from "./sections/GitSection";
import { JiraSection } from "./sections/JiraSection";
import { LlmSection } from "./sections/LlmSection";
import { MatrixSection } from "./sections/MatrixSection";
import { WorkSection } from "./sections/WorkSection";
import type { SettingsForm } from "./useSettingsForm";

export interface SectionStatus { ok: boolean; sub: string; required?: boolean }

export interface SettingsSection {
  id: string;
  label: string;
  status: (ready: SetupState, s: Settings) => SectionStatus;
  Component: ComponentType<{ f: SettingsForm }>;
}

const optional = (ok: boolean, sub: string): SectionStatus => ({ ok, sub: ok ? sub : "необязательно" });

/** Side navigation and content of the settings page, in display order. */
export const SECTIONS: SettingsSection[] = [
  { id: "jira", label: "Jira", status: (r) => ({ ok: r.jira, sub: r.jira ? "подключена" : "обязательно", required: true }), Component: JiraSection },
  { id: "llm", label: "Корпоративный ИИ", status: (r, s) => ({ ok: r.llm, sub: r.llm ? s.llmModel : "рекомендуется" }), Component: LlmSection },
  { id: "git", label: "Git", status: (r, s) => optional(r.git, `репозиториев: ${s.gitRepos.length}`), Component: GitSection },
  { id: "gitlab", label: "GitLab", status: (r, s) => optional(r.gitlab, s.gitlabLocalOnly ? "MR ваших репозиториев" : "все проекты"), Component: GitlabSection },
  { id: "matrix", label: "Matrix", status: (r, s) => optional(r.matrix, s.matrixExcludeRooms.length ? `исключено: ${s.matrixExcludeRooms.length}` : "все комнаты"), Component: MatrixSection },
  { id: "confluence", label: "Confluence", status: (r) => optional(r.confluence, "подключён"), Component: ConfluenceSection },
  { id: "calendar", label: "Почта и календарь", status: (r, s) => optional(r.calendar, s.calendarOnlyCalls ? "только звонки" : "звонки и встречи"), Component: CalendarSection },
  { id: "work", label: "Рабочее время", status: (_, s) => ({ ok: true, sub: `${s.hoursPerDay} ч · ${s.workdays.length} дн./нед.` }), Component: WorkSection },
];
