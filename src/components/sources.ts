import { t } from "../i18n";
import type { Source } from "../types";

export const SOURCE_ORDER: Source[] = ["jira", "git", "gitlab", "matrix", "calendar", "confluence"];

export const sourceLabel = (s: string): string => t().common.sources[s as Source] ?? s;
