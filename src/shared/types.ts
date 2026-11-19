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
  /** Task that gets the time of calls not tied to any task; empty = such calls get no hours. */
  callsTaskKey: string;
  /** Note calls on this computer (Windows). */
  trackCalls: boolean;
  /** Programs counted as calls, by a part of their name. */
  callApps: string[];
  matrixHomeserver: string;
  matrixUserId: string;
  matrixExcludeRooms: string[];
  gitRoot: string;
  gitRepos: string[];
  gitAuthors: string[];
  /** Show markdown notes kept per task in the repositories (a team convention, off by default). */
  aiDocsEnabled: boolean;
  /** Where those notes live; `{key}` is the task key. */
  aiDocsPaths: string[];
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
  callsTaskKey: "",
  trackCalls: false,
  callApps: ["zoom", "teams", "telegram", "slack", "discord", "chrome", "msedge", "firefox", "browser"],
  matrixHomeserver: "",
  matrixUserId: "",
  matrixExcludeRooms: [],
  gitRoot: "",
  gitRepos: [],
  gitAuthors: [],
  aiDocsEnabled: false,
  aiDocsPaths: ["docs/ai/{key}", "ai/{key}"],
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
  /** Set for a call noted on this computer (not from the calendar): the id the user can mark as not work by. */
  localId?: number;
}

/** A call noted on this computer: a tracked program held the microphone. */
export interface LocalCall {
  id: number;
  app: string;
  title: string;
  /** Epoch ms. */
  started: number;
  ended: number;
  /** The user said it was not work. */
  hidden: boolean;
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

/** A Confluence page read in full for the AI analysis of a task (`analysis_pages`). */
export interface PageDoc {
  url: string;
  title: string;
  text: string;
  children: string[];
  /** Web links on the page that lead outside Confluence. */
  links: string[];
  /** 0: linked from the task; 1: reached from such a page (its link or child). */
  depth: number;
}

/** A GitLab link of a task read for the AI analysis (`gitlab_links`). */
export interface GitLabItem {
  url: string;
  kind: "mr" | "issue" | "file" | "wiki";
  title: string;
  text: string;
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
  /** When Jira was last asked for this list (ms); the app serves it from its local store until it gets old or the user refreshes. */
  cachedAt: number;
}

export interface DashRelated {
  key: string;
  summary: string;
  status: string;
  /** Jira status category: "new", "indeterminate" or "done". */
  category: string;
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

/** What local git knows about a task (read-only). */
export interface TaskGit {
  commits: { repo: string; hash: string; date: string; author: string; subject: string; files: string[] }[];
  /** Markdown notes kept per task (optional feature): read one with `api.taskDoc`. */
  docs: { repo: string; repoName: string; path: string; commit: string; date: string; webUrl: string | null }[];
  /** Where it looked: repositories and the refs searched for notes. */
  searched: { repoName: string; refs: string[]; error: string | null }[];
  docsEnabled: boolean;
}

/** The task's merge requests in GitLab and the notes in their branches (read-only). */
export interface TaskMrs {
  configured: boolean;
  mrs: {
    project: string; projectId: number; iid: number; title: string; state: string; webUrl: string;
    sourceBranch: string; targetBranch: string; author: string; updated: string;
    commits: { short: string; title: string; date: string; author: string }[];
    /** Files the MR changes. */
    files: string[];
  }[];
  /** Read one with `api.taskRemoteDoc`. */
  docs: { projectId: number; project: string; refName: string; path: string; mrIid: number }[];
  /** A backend error ({ code, params }) when GitLab could not be read. */
  error: unknown;
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

/** Team roster (typed by the user, kept in the local database); mirrors `store/roster.rs`. */
export type RosterRole = "lead" | "dev" | "qa" | "devLead" | "qaLead" | "other";
export type AccountSystem = "jira" | "gitlab" | "matrix";
export interface RosterTeam { id: number; parentId: number | null; name: string }
export interface RosterAccount { system: AccountSystem; extId: string }
export type AbsenceKind = "vacation" | "sick" | "other";
/** Dates are YYYY-MM-DD, both inclusive. */
export interface RosterAbsence { kind: AbsenceKind; from: string; to: string }
export interface RosterPerson { id: number; teamId: number | null; name: string; role: RosterRole; accounts: RosterAccount[]; absences: RosterAbsence[] }
export interface Roster { teams: RosterTeam[]; people: RosterPerson[] }

/** A person found by name in Jira, GitLab or Matrix. */
export interface PersonHit { extId: string; name: string; detail: string }


/** The user's own account in a system, known from the connection settings. */
export interface MyAccount { system: AccountSystem; extId: string; name: string }

/** GitLab merge request board; mirrors `sources/gitlab/board.rs`. */
export interface MrPerson { username: string; name: string }
export interface Mr {
  projectId: number;
  iid: number;
  project: string;
  title: string;
  url: string;
  sourceBranch: string;
  targetBranch: string;
  /** Jira key found in the title or the branch. */
  task: string | null;
  author: MrPerson;
  draft: boolean;
  conflicts: boolean;
  /** No unresolved discussion threads. */
  discussionsResolved: boolean;
  mergeStatus: string;
  comments: number;
  created: number;
  updated: number;
  reviewers: MrPerson[];
  approvedBy: MrPerson[];
  /** Approvals still missing; null when GitLab does not say. */
  approvalsLeft: number | null;
  detailed: boolean;
}
/** The Jira task an MR is about; fixVersions are its releases. */
export interface MrTask { key: string; summary: string; status: string; fixVersions: string[] }
export interface MrBoard { me: MrPerson; mrs: Mr[]; cachedAt: number; tasks: MrTask[] }
