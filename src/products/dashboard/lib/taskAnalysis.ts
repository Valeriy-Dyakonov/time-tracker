import type { DashIssue, DashProfile, GitLabItem, IssueDetail, PageDoc, TaskGit, TaskMrs } from "@/shared/types";
import { parseWiki, type Block, type Inline } from "./wiki";

/**
 * "AI analysis" of one task: everything the app can read about it (description, comments, links,
 * epic/parent, Confluence pages, commits and notes in local git) packed into one prompt, and the
 * answer parsed into sections. Read-only: nothing is written anywhere.
 */

export interface AnalysisInput {
  detail: IssueDetail;
  epic?: DashIssue;
  parent?: DashIssue;
  pages: PageDoc[];
  /** MRs, issues, files and wiki pages from GitLab links of the task and its pages. */
  gitlab?: GitLabItem[];
  git: TaskGit;
  mrs?: TaskMrs["mrs"];
  docs: { path: string; text: string }[];
}

/** Whose questions the analysis answers: the task's state (a lead's view), how to build it, how to test it. */
export type AnalysisMode = "overview" | "dev" | "qa";
export const ANALYSIS_MODES: AnalysisMode[] = ["overview", "dev", "qa"];

export type SectionKey =
  | "done" | "next" | "risks" | "details" | "questions"
  | "requirements" | "pitfalls"
  | "checks" | "integration" | "edge" | "regression" | "setup";
export type Tone = "good" | "accent" | "bad" | "warn" | "muted";

/** The lists each mode asks for, in display order; the keys are the JSON keys of the answer. */
export const MODE_SECTIONS: Record<AnalysisMode, { key: SectionKey; tone: Tone }[]> = {
  overview: [
    { key: "done", tone: "good" }, { key: "next", tone: "accent" }, { key: "risks", tone: "bad" },
    { key: "details", tone: "muted" }, { key: "questions", tone: "warn" },
  ],
  // The dev view leads with `changes` (cards per service); these lists follow.
  dev: [
    { key: "requirements", tone: "accent" }, { key: "done", tone: "good" }, { key: "pitfalls", tone: "bad" }, { key: "questions", tone: "warn" },
  ],
  qa: [
    { key: "checks", tone: "accent" }, { key: "integration", tone: "accent" }, { key: "edge", tone: "bad" }, { key: "regression", tone: "warn" },
    { key: "setup", tone: "muted" }, { key: "questions", tone: "warn" },
  ],
};

/** The dashboard profile picks the first view: a lead mostly needs the state. */
export const modeForProfile = (p: DashProfile): AnalysisMode => (p === "dev" ? "dev" : p === "qa" ? "qa" : "overview");

/** One point of the answer; where it came from is kept apart so the text stays readable. */
export interface Point {
  text: string;
  source: string;
}

/** What to change in one service: in plain words, and roughly where. */
export interface Change {
  service: string;
  what: string;
  where: string[];
  source: string;
}

export interface TaskAnalysis {
  mode: AnalysisMode;
  summary: string;
  state: string;
  /** Development view only. */
  changes: Change[];
  sections: Partial<Record<SectionKey, Point[]>>;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Long texts share one budget, in order: what comes first (linked directly) keeps the most. */
const PAGES_BUDGET = 15_000;
const GITLAB_BUDGET = 15_000;
const TOUCHED_FILES = 25;

/** Services (GitLab projects, local repositories) and the files the task's MRs and commits change. */
export function touchedServices(x: Pick<AnalysisInput, "git" | "mrs">): { service: string; files: string[] }[] {
  const by = new Map<string, Set<string>>();
  const add = (service: string, files: string[]) => {
    const name = service.split("/").pop() || service;
    const set = by.get(name) ?? new Set<string>();
    files.forEach((f) => set.add(f));
    by.set(name, set);
  };
  for (const r of x.mrs ?? []) add(r.project, r.files);
  for (const c of x.git.commits) add(c.repo, c.files);
  return [...by].map(([service, files]) => ({ service, files: [...files].slice(0, TOUCHED_FILES) }));
}
function within<T extends { text: string }>(items: T[], budget: number): T[] {
  let left = budget;
  return items.flatMap((x) => {
    if (left <= 200) return [];
    const text = cut(x.text, left);
    left -= text.length;
    return [{ ...x, text }];
  });
}

function inlineLinks(parts: Inline[], out: Set<string>) {
  for (const x of parts) {
    if (x.t === "link") out.add(x.href);
    if (x.t === "b" || x.t === "i" || x.t === "u" || x.t === "s") inlineLinks(x.v, out);
  }
}

/** Web links in Jira text: where the related wiki pages, MRs and files are. */
export function linksIn(...texts: string[]): string[] {
  const out = new Set<string>();
  const walk = (b: Block) => {
    if (b.t === "p" || b.t === "quote") b.lines.forEach((l) => inlineLinks(l, out));
    else if (b.t === "h") inlineLinks(b.v, out);
    else if (b.t === "ul" || b.t === "ol") b.items.forEach((l) => inlineLinks(l, out));
    else if (b.t === "table") b.rows.forEach((r) => r.forEach((c) => inlineLinks(c.v, out)));
  };
  for (const t of texts) parseWiki(t).forEach(walk);
  return [...out].slice(0, 40);
}

/** The user message: compact JSON, long texts cut so the request stays within what a model reads well. */
export function buildAnalysisPrompt(x: AnalysisInput): string {
  const d = x.detail;
  const brief = (i?: DashIssue) => (i ? { key: i.key, type: i.issueType, summary: i.summary, status: i.status } : undefined);
  return JSON.stringify({
    task: {
      key: d.key, type: d.issueType, summary: d.summary, status: d.status, priority: d.priority,
      assignee: d.assignee?.display, people: d.people.map((p) => `${p.field}: ${p.person.display}`),
      releases: d.fixVersions, labels: d.labels, components: d.components, due: d.due,
      description: cut(d.description, 8000),
    },
    touched: touchedServices(x),
    epic: brief(x.epic),
    parent: brief(x.parent),
    comments: d.comments.slice(-15).map((c) => ({ author: c.author, at: c.created ? new Date(c.created).toISOString().slice(0, 10) : "", text: cut(c.body, 1200) })),
    subtasks: d.subtasks.map((r) => `${r.key} [${r.status}] ${r.summary}`),
    links: d.linked.map((r) => `${r.relation} ${r.key} [${r.status}] ${r.summary}`),
    pages: within([...x.pages].sort((a, b) => a.depth - b.depth), PAGES_BUDGET).map((p) => ({
      title: p.title, url: p.url, via: p.depth ? "nested" : "task", text: p.text, children: p.children.slice(0, 10),
    })),
    gitlab: within(x.gitlab ?? [], GITLAB_BUDGET).map((g) => ({ kind: g.kind, title: g.title, url: g.url, text: g.text })),
    merge_requests: (x.mrs ?? []).slice(0, 10).map((r) => ({
      ref: `${r.project}!${r.iid}`, title: r.title, state: r.state, branch: `${r.sourceBranch} -> ${r.targetBranch}`, author: r.author,
      updated: r.updated.slice(0, 10), commits: r.commits.slice(0, 15).map((c) => c.title), files: r.files.slice(0, 30),
    })),
    commits: x.git.commits.slice(0, 25).map((c) => ({ repo: c.repo, at: c.date.slice(0, 10), author: c.author, subject: c.subject, files: c.files.slice(0, 15) })),
    notes: x.docs.slice(0, 5).map((n) => ({ path: n.path, text: cut(n.text, 4000) })),
  });
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim()) : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** `{text, source}`, or a plain string whose trailing "(source)" is split off. */
function point(v: unknown): Point | null {
  if (typeof v === "string") {
    const t = v.trim();
    const m = t.match(/^(.*\S)\s*\(([^()]{1,80})\)\.?$/s);
    return t ? (m ? { text: m[1], source: m[2].trim() } : { text: t, source: "" }) : null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const text = str(o.text);
    return text ? { text, source: str(o.source) } : null;
  }
  return null;
}
const points = (v: unknown): Point[] => (Array.isArray(v) ? v.map(point).filter((p): p is Point => !!p) : []);

function changes(v: unknown): Change[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const what = str(o.what);
    return what ? [{ service: str(o.service), what, where: list(o.where).slice(0, 6), source: str(o.source) }] : [];
  });
}

/** The answer as the mode's sections; null when it is not usable at all. */
export function parseAnalysis(raw: string, mode: AnalysisMode): TaskAnalysis | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(raw.slice(a, b + 1)) as Record<string, unknown>;
    const sections: TaskAnalysis["sections"] = {};
    for (const { key } of MODE_SECTIONS[mode]) sections[key] = points(o[key]);
    const r: TaskAnalysis = { mode, summary: str(o.summary), state: str(o.state), changes: mode === "dev" ? changes(o.changes) : [], sections };
    return r.summary || r.state || r.changes.length || Object.values(sections).some((l) => l.length) ? r : null;
  } catch {
    return null;
  }
}
