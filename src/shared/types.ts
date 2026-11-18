export interface Settings {
  jiraUrl: string;
  contextProjects: string[];
  /** Work Dashboard role. */
  dashboardProfile: DashProfile;
  llmBaseUrl: string;
  llmModel: string;
  /** Requests to the AI per minute; 0 = no limit. */
  llmRpm: number;
  confluenceUrl: string;
  gitlabUrl: string;
  gitlabLocalOnly: boolean;
  exchangeUrl: string;
  exchangeUser: string;
  calendarOnlyCalls: boolean;
  matrixHomeserver: string;
  matrixUserId: string;
  matrixExcludeRooms: string[];
  gitRoot: string;
  gitRepos: string[];
  gitAuthors: string[];
  hoursPerDay: number;
  /** Production calendar country (ru, by, kz, ua, uz, us); empty = weekdays only. */
  holidayCountry: string;
  /** Pre-holiday days are one hour shorter. */
  shortDays: boolean;
  /** 1 = Monday ... 7 = Sunday */
  workdays: number[];
  acceptInvalidCerts: boolean;
}

export const defaultSettings: Settings = {
  jiraUrl: "",
  contextProjects: [],
  dashboardProfile: "dev",
  llmBaseUrl: "",
  llmModel: "",
  llmRpm: 30,
  confluenceUrl: "",
  gitlabUrl: "",
  gitlabLocalOnly: true,
  exchangeUrl: "",
  exchangeUser: "",
  calendarOnlyCalls: false,
  matrixHomeserver: "",
  matrixUserId: "",
  matrixExcludeRooms: [],
  gitRoot: "",
  gitRepos: [],
  gitAuthors: [],
  hoursPerDay: 8,
  holidayCountry: "ru",
  shortDays: true,
  workdays: [1, 2, 3, 4, 5],
  acceptInvalidCerts: false,
};

export type Source = "jira" | "git" | "gitlab" | "matrix" | "confluence" | "calendar";

export interface Meeting {
  ts: number;
  endTs: number;
  minutes: number;
  title: string;
  organizer: string;
  location: string;
  isCall: boolean;
  tentative: boolean;
}

export interface Evt {
  source: Source;
  ts: number;
  issueKey: string | null;
  text: string;
  context: string | null;
  weight: number;
  /** Chat only: who the message was addressed to. */
  to?: string | null;
  /** Language-neutral action type from the backend: "created", "comment", "changed", "mr_opened", "mr_merged", "mr_merged_by_me", "mr_approved", "mr_comment". */
  kind?: string | null;
}

/** A Confluence page related to a task (context for the AI). */
export interface PageCtx {
  url: string;
  title: string;
  excerpt: string;
  children: string[];
}

export interface IssueInfo {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  /** Context around the task: description start, parent, epic, linked issues. */
  description?: string;
  parent?: string | null;
  epic?: string | null;
  links?: string[];
  /** Status history from Jira, all authors, oldest first (only for tasks loaded by the period search). */
  transitions?: { ts: number; from: string; to: string; byMe: boolean }[];
  /** Links from the description (used to find Confluence pages). */
  urls?: string[];
  /** Related Confluence pages: context only. */
  pages?: PageCtx[];
  /** ms since epoch: a task cannot be worked on before it was created or after it was resolved. */
  created?: number | null;
  resolved?: number | null;
  /** The user is or was the assignee; tasks with `false` are context only and never get hours. */
  assignedToMe?: boolean;
}

/** Work Dashboard role: developer, QA or lead. */
export type DashProfile = "dev" | "qa" | "lead";

export interface DashPerson {
  name: string;
  display: string;
  me: boolean;
}

/** A task on the "Work dashboard". */
export interface DashIssue {
  key: string;
  summary: string;
  status: string;
  /** Jira status category: "new", "indeterminate" or "done". */
  category: string;
  priority: string;
  issueType: string;
  project: string;
  projectName: string;
  parent: string | null;
  epic: string | null;
  fixVersions: string[];
  /** Linked tasks with their type: containers (epic, release...) are often a plain "relates" link. */
  links: { key: string; issueType: string; relation: string }[];
  assignee: DashPerson | null;
  /** User-type custom fields of the installation (Responsible, QA...) with who is in them. */
  people: { field: string; person: DashPerson }[];
  /** The user is the assignee or in one of the people fields. */
  mine: boolean;
  updated: number | null;
  resolved: number | null;
  /** YYYY-MM-DD */
  due: string | null;
}

export interface DashData {
  issues: DashIssue[];
  /** Epics and parents of the issues: group headers, never tasks. */
  context: DashIssue[];
  projects: string[];
}

export interface DashRelated {
  key: string;
  summary: string;
  status: string;
  relation: string;
}

export interface IssueDetail extends DashIssue {
  reporter: DashPerson | null;
  created: number | null;
  labels: string[];
  components: string[];
  /** Jira wiki markup, shown as plain text. */
  description: string;
  comments: { author: string; created: number | null; body: string }[];
  commentTotal: number;
  subtasks: DashRelated[];
  /** Linked tasks with summary and status. */
  linked: DashRelated[];
}

/** A worklog of the user in Jira (Tempo on Server/DC keeps its worklogs there). */
export interface JiraWorklog {
  id: string;
  key: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  seconds: number;
  comment: string;
}

export interface TaskHours {
  key: string;
  hours: number;
  notes: string[];
}

export type LogLevel = "info" | "ok" | "warn" | "error";
export interface LogEntry {
  t: number;
  level: LogLevel;
  msg: string;
}

/** One piece of evidence the day was built from (shown in the AI review tab). */
export interface Evidence {
  ts: number;
  source: Source;
  key: string | null;
  text: string;
  /** Where it happened: chat room, git branch, MR branch... */
  context?: string;
  /** Chat only: who the message was addressed to. */
  to?: string;
}

/** How to fill working days that have no activity at all. */
export type FillMode = "neighbors" | "period" | "none";

export type DayStatus = "queued" | "running" | "done" | "fallback" | "nodata";
export interface DayProgress {
  date: string;
  status: DayStatus;
  events: number;
  tasks?: { key: string; hours: number }[];
  note?: string;
}

export interface DayPlan {
  date: string; // YYYY-MM-DD, local
  target: number;
  tasks: TaskHours[];
  summary: string;
  /**
   * "activity" – built from the day's own events; "tempo" – already filled in Tempo, taken as is without analysis;
   * "inferred" – copied from a neighbouring day; "empty" – nothing to go on.
   */
  basis: "activity" | "tempo" | "inferred" | "empty";
  inferredFrom?: string;
  /** Day switched off by the user (vacation, sick leave, ...). */
  off: boolean;
  eventCount: number;
  /** Human-readable explanation of how this day was built (AI or heuristic). */
  reasoning: string;
  evidence: Evidence[];
  /** Calls and meetings of the day: shown separately, their time is part of the day, not subtracted. */
  meetings: Meeting[];
}

export interface Analysis {
  start: string;
  end: string;
  hoursPerDay: number;
  jiraUrl: string;
  days: DayPlan[];
  issues: Record<string, IssueInfo>;
  warnings: string[];
  usedAi: boolean;
  fillMode: FillMode;
  /** AI (or template) summary of the whole period, plain text. */
  narrative: string;
  log: LogEntry[];
  createdAt: number;
}
