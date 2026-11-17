import type { Settings } from "../types";

export interface SetupState {
  jira: boolean;
  llm: boolean;
  confluence: boolean;
  calendar: boolean;
  matrix: boolean;
  git: boolean;
  gitlab: boolean;
}

/** Which integrations are filled in. `stored` = which tokens exist in the OS keychain. */
export function setupState(s: Settings, stored: Record<string, boolean>): SetupState {
  return {
    jira: !!s.jiraUrl.trim() && !!stored.jira_pat,
    llm: !!s.llmBaseUrl.trim() && !!s.llmModel.trim(),
    confluence: !!s.confluenceUrl.trim() && !!stored.confluence_pat,
    calendar: !!s.exchangeUrl.trim() && !!s.exchangeUser.trim() && !!stored.exchange_password,
    matrix: !!s.matrixHomeserver.trim() && !!s.matrixUserId.trim() && !!stored.matrix_token,
    git: s.gitRepos.length > 0,
    gitlab: !!s.gitlabUrl.trim() && !!stored.gitlab_pat,
  };
}
