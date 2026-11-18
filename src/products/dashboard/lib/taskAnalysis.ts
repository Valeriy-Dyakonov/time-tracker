import type { DashIssue, IssueDetail, PageCtx, TaskGit } from "@/shared/types";
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
  pages: PageCtx[];
  git: TaskGit;
  docs: { path: string; text: string }[];
}

export interface TaskAnalysis {
  summary: string;
  state: string;
  done: string[];
  next: string[];
  risks: string[];
  details: string[];
  questions: string[];
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function inlineLinks(parts: Inline[], out: Set<string>) {
  for (const x of parts) {
    if (x.t === "link") out.add(x.href);
    if (x.t === "b" || x.t === "i" || x.t === "u" || x.t === "s") inlineLinks(x.v, out);
  }
}

/** Web links in Jira text: where the related wiki pages are. */
export function linksIn(...texts: string[]): string[] {
  const out = new Set<string>();
  const walk = (b: Block) => {
    if (b.t === "p" || b.t === "quote") b.lines.forEach((l) => inlineLinks(l, out));
    else if (b.t === "h") inlineLinks(b.v, out);
    else if (b.t === "ul" || b.t === "ol") b.items.forEach((l) => inlineLinks(l, out));
    else if (b.t === "table") b.rows.forEach((r) => r.forEach((c) => inlineLinks(c.v, out)));
  };
  for (const t of texts) parseWiki(t).forEach(walk);
  return [...out].slice(0, 20);
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
    epic: brief(x.epic),
    parent: brief(x.parent),
    comments: d.comments.slice(-15).map((c) => ({ author: c.author, at: c.created ? new Date(c.created).toISOString().slice(0, 10) : "", text: cut(c.body, 1200) })),
    subtasks: d.subtasks.map((r) => `${r.key} [${r.status}] ${r.summary}`),
    links: d.linked.map((r) => `${r.relation} ${r.key} [${r.status}] ${r.summary}`),
    pages: x.pages.slice(0, 8).map((p) => ({ title: p.title, text: cut(p.excerpt, 1500), children: p.children.slice(0, 10) })),
    commits: x.git.commits.slice(0, 25).map((c) => ({ repo: c.repo, at: c.date.slice(0, 10), author: c.author, subject: c.subject, files: c.files.slice(0, 15) })),
    notes: x.docs.slice(0, 5).map((n) => ({ path: n.path, text: cut(n.text, 4000) })),
  });
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim()) : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The answer as sections; null when it is not usable at all. */
export function parseAnalysis(raw: string): TaskAnalysis | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(raw.slice(a, b + 1)) as Record<string, unknown>;
    const r: TaskAnalysis = {
      summary: str(o.summary), state: str(o.state), done: list(o.done), next: list(o.next),
      risks: list(o.risks), details: list(o.details), questions: list(o.questions),
    };
    return r.summary || r.state || r.done.length || r.next.length ? r : null;
  } catch {
    return null;
  }
}
