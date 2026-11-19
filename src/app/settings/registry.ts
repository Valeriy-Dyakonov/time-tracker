import type { ComponentType } from "react";
import type { SetupState } from "@/shared/lib/setup";
import type { Settings } from "@/shared/types";
import { CalendarSection } from "./sections/CalendarSection";
import { CallsSection } from "./sections/CallsSection";
import { ConfluenceSection } from "./sections/ConfluenceSection";
import { GitlabSection } from "./sections/GitlabSection";
import { GitSection } from "./sections/GitSection";
import { JiraSection } from "./sections/JiraSection";
import { LlmSection } from "./sections/LlmSection";
import { MatrixSection } from "./sections/MatrixSection";
import { WorkSection } from "./sections/WorkSection";
import { TransferSection } from "./sections/TransferSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { readTheme, themeText } from "@/shared/theme";
import { hours, t } from "@/i18n";
import type { SettingsForm } from "./useSettingsForm";

type SectionId = keyof ReturnType<typeof t>["settings"]["nav"];

export interface SectionStatus { ok: boolean; sub: string; required?: boolean }

export type GroupId = keyof ReturnType<typeof t>["settings"]["groups"];

export interface SettingsSection {
  id: SectionId;
  group: GroupId;
  status: (ready: SetupState, s: Settings) => SectionStatus;
  Component: ComponentType<{ f: SettingsForm }>;
}

const optional = (ok: boolean, sub: () => string): SectionStatus => ({ ok, sub: ok ? sub() : t().common.optional });
const st = () => t().settings.status;

export const sectionLabel = (id: SectionId): string => t().settings.nav[id];

/** Side navigation and content of the settings page, in display order. */
export const SECTIONS: SettingsSection[] = [
  { id: "jira", group: "connections", status: (r) => ({ ok: r.jira, sub: r.jira ? st().jiraOn : t().common.required, required: true }), Component: JiraSection },
  { id: "llm", group: "connections", status: (r, s) => ({ ok: r.llm, sub: r.llm ? s.llmModel : t().common.recommended }), Component: LlmSection },
  { id: "git", group: "connections", status: (r, s) => optional(r.git, () => st().repos(s.gitRepos.length)), Component: GitSection },
  { id: "gitlab", group: "connections", status: (r, s) => optional(r.gitlab, () => (s.gitlabLocalOnly ? st().gitlabLocal : st().gitlabAll)), Component: GitlabSection },
  { id: "matrix", group: "connections", status: (r, s) => optional(r.matrix, () => (s.matrixExcludeRooms.length ? st().matrixExcluded(s.matrixExcludeRooms.length) : st().matrixAll)), Component: MatrixSection },
  { id: "confluence", group: "connections", status: (r) => optional(r.confluence, () => st().confluenceOn), Component: ConfluenceSection },
  { id: "calendar", group: "connections", status: (r, s) => optional(r.calendar, () => (s.calendarOnlyCalls ? st().calendarCalls : st().calendarAll)), Component: CalendarSection },
  { id: "calls", group: "work", status: (r, s) => optional(r.calls, () => `${st().callsOn} · ${s.callApps.length}`), Component: CallsSection },
  { id: "work", group: "work", status: (_, s) => ({ ok: true, sub: st().work(hours(s.hoursPerDay), s.workdays.length) }), Component: WorkSection },
  { id: "transfer", group: "app", status: () => ({ ok: true, sub: t().settings.transfer.sub }), Component: TransferSection },
  { id: "appearance", group: "app", status: () => ({ ok: true, sub: themeText(readTheme()).label }), Component: AppearanceSection },
];

/** Groups of the side menu in display order; each holds its sections in the order of `SECTIONS`. */
export const GROUPS: GroupId[] = ["connections", "work", "app"];
