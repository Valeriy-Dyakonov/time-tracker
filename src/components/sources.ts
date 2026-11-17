import type { Source } from "../types";

export const SOURCE_LABELS: Record<Source, string> = {
  jira: "Jira",
  git: "Git",
  gitlab: "GitLab",
  matrix: "Matrix",
  confluence: "Confluence",
  calendar: "Календарь",
};

export const SOURCE_ORDER: Source[] = ["jira", "git", "gitlab", "matrix", "calendar", "confluence"];

export const sourceLabel = (s: string): string => SOURCE_LABELS[s as Source] ?? s;
