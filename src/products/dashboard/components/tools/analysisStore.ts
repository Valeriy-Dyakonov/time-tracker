import { getLocale } from "@/i18n";
import type { GitLabItem } from "@/shared/types";
import type { AnalysisMode, TaskAnalysis } from "../../lib/taskAnalysis";

/**
 * AI analyses are model requests, which are limited: each one is kept (also across restarts) and each
 * running one is shared, so reopening a panel or a task never asks the model again by itself.
 */

/** One thing the AI was given, listed under the answer so the user sees what it is based on. */
export type Read = { kind: "page" | "nested" | GitLabItem["kind"] | "note"; title: string; url: string | null };
export type Result = { r: TaskAnalysis; used: string[]; read: Read[]; /** ISO time of the analysis. */ at: string };
export type Step = "pages" | "git" | "gitlab" | "notes" | "ask";

const STORE = "worklog.dashboard.analysis.v1";
const KEEP = 40;

/** The answer is in the UI language, so a result belongs to the task, the mode and the language. */
export const analysisId = (key: string, mode: AnalysisMode) => `${key}|${mode}|${getLocale()}`;

function load(): Record<string, Result> {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Record<string, Result>) : {};
  } catch {
    return {};
  }
}

const results: Record<string, Result> = load();

export const getResult = (id: string): Result | null => {
  const r = results[id];
  // Results saved by an older version lack the newer fields: drop them rather than break the panel.
  return r && Array.isArray(r.r?.changes) && Array.isArray(r.read) ? r : null;
};

export function saveResult(id: string, r: Result): void {
  results[id] = r;
  const newest = Object.entries(results).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, KEEP);
  for (const k of Object.keys(results)) if (!newest.some(([n]) => n === k)) delete results[k];
  try { localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(newest))); } catch { /* storage full or unavailable */ }
}

export const hasResult = (key: string, modes: AnalysisMode[]) => modes.some((m) => !!getResult(analysisId(key, m)));

/** A running analysis: its progress and its outcome, for whichever panel shows it. */
export interface Job {
  step: Step;
  promise: Promise<Result>;
  listeners: Set<(s: Step) => void>;
}

const jobs = new Map<string, Job>();

export const runningJob = (id: string): Job | undefined => jobs.get(id);

/** Starts `work` unless the same analysis is already running; either way returns that one run. */
export function startJob(id: string, work: (step: (s: Step) => void) => Promise<Result>): Job {
  const running = jobs.get(id);
  if (running) return running;
  const job: Job = { step: "pages", listeners: new Set(), promise: Promise.resolve(null as never) };
  const step = (s: Step) => { job.step = s; job.listeners.forEach((l) => l(s)); };
  job.promise = work(step)
    .then((r) => { saveResult(id, r); return r; })
    .finally(() => jobs.delete(id));
  jobs.set(id, job);
  return job;
}
