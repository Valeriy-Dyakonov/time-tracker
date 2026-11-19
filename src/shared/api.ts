import { invoke } from "@tauri-apps/api/core";
import { getLocale, t } from "@/i18n";
import type { ErrorParams } from "@/i18n/messages/ru/errors";
import type { DashData, Evt, GitLabItem, IssueDetail, PageDoc, TaskGit, TaskMrs, IssueInfo, JiraWorklog, Meeting, PageCtx, Settings } from "./types";

export interface JiraResult {
  me: string;
  issues: IssueInfo[];
  events: Evt[];
}
export interface Room {
  id: string;
  name: string;
}

export interface RepoInfo {
  path: string;
  name: string;
}

type Service = "jira" | "llm" | "gitlab" | "matrix" | "confluence" | "calendar";
type ProbeOk = { kind: "user"; name: string } | { kind: "meetings"; count: number } | { kind: "reply"; text: string };

/** A backend failure worded in the UI language; `String(e)` gives just the message. */
export class BackendError extends Error {
  constructor(readonly code: string, readonly params: ErrorParams, message: string) {
    super(message);
    this.name = "BackendError";
  }
  toString() {
    return this.message;
  }
}

function localize(e: unknown): unknown {
  if (!e || typeof e !== "object" || !("code" in e)) return e;
  const { code, params = {} } = e as { code: string; params?: ErrorParams };
  const m = t().errors;
  const word = m.codes[code];
  const text = word ? word(params) : m.unknown(code, Object.values(params).filter(Boolean).join(", "));
  return new BackendError(code, params, text);
}

/** A backend error ({ code, params }) returned inside data rather than thrown, worded in the UI language. */
export const errorText = (e: unknown): string => String(localize(e));

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw localize(e);
  }
}

/** Commands whose data includes worded text (event descriptions, names) get the UI language. */
const lang = () => ({ lang: getLocale() });

function probeText(r: ProbeOk): string {
  const p = t().errors.probe;
  switch (r.kind) {
    case "user": return p.user(r.name);
    case "meetings": return p.meetings(r.count);
    case "reply": return p.reply(r.text);
  }
}

export const api = {
  loadSettings: () => call<Settings>("load_settings"),
  saveSettings: (settings: Settings) => call<void>("save_settings", { settings }),
  setSecret: (name: string, value: string) => call<void>("set_secret", { name, value }),
  secretsStatus: () => call<Record<string, boolean>>("secrets_status"),
  testConnection: (service: Service) => call<ProbeOk>("test_connection", { service }).then(probeText),
  openIssue: (key: string) => call<void>("open_issue", { key }),
  fetchJira: (start: string, end: string) => call<JiraResult>("fetch_jira", { start, end, ...lang() }),
  lookupIssues: (keys: string[]) => call<IssueInfo[]>("lookup_issues", { keys }),
  jiraDashboard: (profile: string, historyDays?: number, force?: boolean) => call<DashData>("jira_dashboard", { profile, historyDays, force }),
  clearCache: () => call<void>("clear_cache"),
  saveExport: (path: string, content: string) => call<void>("save_export", { path, content }),
  openLink: (url: string) => call<void>("open_link", { url }),
  taskGit: (key: string) => call<TaskGit>("task_git", { key }),
  taskDoc: (repo: string, commit: string, path: string) => call<string>("task_doc", { repo, commit, path }),
  taskMrs: (key: string) => call<TaskMrs>("task_mrs", { key }),
  taskRemoteDoc: (projectId: number, refName: string, path: string) => call<string>("task_remote_doc", { projectId, refName, path }),
  analysisPages: (key: string, urls: string[]) => call<PageDoc[]>("analysis_pages", { key, urls }),
  gitlabLinks: (urls: string[]) => call<GitLabItem[]>("gitlab_links", { urls }),
  jiraIssueDetail: (key: string) => call<IssueDetail>("jira_issue_detail", { key }),
  jiraWorklogs: (start: string, end: string) => call<JiraWorklog[]>("jira_worklogs", { start, end }),
  jiraAddWorklog: (key: string, date: string, seconds: number, comment: string) =>
    call<JiraWorklog>("jira_add_worklog", { key, date, seconds, comment }),
  jiraUpdateWorklog: (key: string, id: string, seconds: number, comment: string) =>
    call<JiraWorklog>("jira_update_worklog", { key, id, seconds, comment }),
  jiraDeleteWorklog: (key: string, id: string) => call<void>("jira_delete_worklog", { key, id }),
  scanGitRepos: (root: string) => call<RepoInfo[]>("scan_git_repos", { root }),
  fetchGit: (start: string, end: string) => call<Evt[]>("fetch_git", { start, end, ...lang() }),
  fetchConfluence: (start: string, end: string) => call<Evt[]>("fetch_confluence", { start, end, ...lang() }),
  fetchCalendar: (start: string, end: string) => call<Meeting[]>("fetch_calendar", { start, end, ...lang() }),
  fetchMatrix: (start: string, end: string) => call<Evt[]>("fetch_matrix", { start, end, ...lang() }),
  matrixLoginSso: () => call<string>("matrix_login_sso", lang()),
  matrixLoginPassword: (user: string, password: string) => call<string>("matrix_login_password", { user, password }),
  listMatrixRooms: () => call<Room[]>("list_matrix_rooms", lang()),
  fetchGitlab: (start: string, end: string) =>
    call<{ me: string; events: Evt[]; scoped: string[]; fallback: boolean }>("fetch_gitlab", { start, end, ...lang() }),
  fetchHolidays: (country: string, start: string, end: string) =>
    call<{ source: string; complete: boolean; days: { date: string; kind: "off" | "short" | "work"; name?: string }[] }>(
      "fetch_holidays",
      { country, start, end, ...lang() },
    ),
  fetchIssuePages: (issues: { key: string; urls: string[] }[]) =>
    call<{ key: string; pages: PageCtx[] }[]>("fetch_issue_pages", { issues }),
  llmChat: (system: string, user: string) => call<string>("llm_chat", { system, user }),
};

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
