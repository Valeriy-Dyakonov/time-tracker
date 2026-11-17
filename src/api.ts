import { invoke } from "@tauri-apps/api/core";
import type { Evt, IssueInfo, Meeting, PageCtx, Settings } from "./types";

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

export const api = {
  loadSettings: () => invoke<Settings>("load_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  setSecret: (name: string, value: string) => invoke<void>("set_secret", { name, value }),
  secretsStatus: () => invoke<Record<string, boolean>>("secrets_status"),
  testConnection: (service: "jira" | "llm" | "gitlab" | "matrix" | "confluence" | "calendar") => invoke<string>("test_connection", { service }),
  openIssue: (key: string) => invoke<void>("open_issue", { key }),
  fetchJira: (start: string, end: string) => invoke<JiraResult>("fetch_jira", { start, end }),
  lookupIssues: (keys: string[]) => invoke<IssueInfo[]>("lookup_issues", { keys }),
  scanGitRepos: (root: string) => invoke<RepoInfo[]>("scan_git_repos", { root }),
  fetchGit: (start: string, end: string) => invoke<Evt[]>("fetch_git", { start, end }),
  fetchConfluence: (start: string, end: string) => invoke<Evt[]>("fetch_confluence", { start, end }),
  fetchCalendar: (start: string, end: string) => invoke<Meeting[]>("fetch_calendar", { start, end }),
  fetchMatrix: (start: string, end: string) => invoke<Evt[]>("fetch_matrix", { start, end }),
  matrixLoginSso: () => invoke<string>("matrix_login_sso"),
  matrixLoginPassword: (user: string, password: string) => invoke<string>("matrix_login_password", { user, password }),
  listMatrixRooms: () => invoke<Room[]>("list_matrix_rooms"),
  fetchGitlab: (start: string, end: string) =>
    invoke<{ me: string; events: Evt[]; scoped: string[]; fallback: boolean }>("fetch_gitlab", { start, end }),
  fetchHolidays: (country: string, start: string, end: string) =>
    invoke<{ source: string; complete: boolean; days: { date: string; kind: "off" | "short" | "work"; name?: string }[] }>("fetch_holidays", { country, start, end }),
  fetchIssuePages: (issues: { key: string; urls: string[] }[]) =>
    invoke<{ key: string; pages: PageCtx[] }[]>("fetch_issue_pages", { issues }),
  llmChat: (system: string, user: string) => invoke<string>("llm_chat", { system, user }),
};

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
