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
import { AppearanceSection } from "./sections/AppearanceSection";
import { readTheme, themeText } from "../../theme";
import { hours, t } from "../../i18n";
import type { SettingsForm } from "./useSettingsForm";

type SectionId = keyof ReturnType<typeof t>["settings"]["nav"];

export interface SectionStatus { ok: boolean; sub: string; required?: boolean }

export interface SettingsSection {
  id: SectionId;
  status: (ready: SetupState, s: Settings) => SectionStatus;
  Component: ComponentType<{ f: SettingsForm }>;
}

const optional = (ok: boolean, sub: () => string): SectionStatus => ({ ok, sub: ok ? sub() : t().common.optional });
const st = () => t().settings.status;

export const sectionLabel = (id: SectionId): string => t().settings.nav[id];

/** Side navigation and content of the settings page, in display order. */
export const SECTIONS: SettingsSection[] = [
  { id: "jira", status: (r) => ({ ok: r.jira, sub: r.jira ? st().jiraOn : t().common.required, required: true }), Component: JiraSection },
  { id: "llm", status: (r, s) => ({ ok: r.llm, sub: r.llm ? s.llmModel : t().common.recommended }), Component: LlmSection },
  { id: "git", status: (r, s) => optional(r.git, () => st().repos(s.gitRepos.length)), Component: GitSection },
  { id: "gitlab", status: (r, s) => optional(r.gitlab, () => (s.gitlabLocalOnly ? st().gitlabLocal : st().gitlabAll)), Component: GitlabSection },
  { id: "matrix", status: (r, s) => optional(r.matrix, () => (s.matrixExcludeRooms.length ? st().matrixExcluded(s.matrixExcludeRooms.length) : st().matrixAll)), Component: MatrixSection },
  { id: "confluence", status: (r) => optional(r.confluence, () => st().confluenceOn), Component: ConfluenceSection },
  { id: "calendar", status: (r, s) => optional(r.calendar, () => (s.calendarOnlyCalls ? st().calendarCalls : st().calendarAll)), Component: CalendarSection },
  { id: "work", status: (_, s) => ({ ok: true, sub: st().work(hours(s.hoursPerDay), s.workdays.length) }), Component: WorkSection },
  { id: "appearance", status: () => ({ ok: true, sub: themeText(readTheme()).label }), Component: AppearanceSection },
];
