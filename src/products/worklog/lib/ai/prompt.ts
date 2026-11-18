import type { Evt, IssueInfo } from "@/shared/types";
import { t } from "@/i18n";
import { pad } from "@/shared/lib/dates";

/** System prompt for splitting one day between tasks, in the current language (so the AI answers in it). */
export const dayPrompt = (): string => t().analysis.prompt.day;

/** System prompt for the period summary, in the current language. */
export const narrativeSystemPrompt = (): string => t().analysis.prompt.narrative;

const MAX_EVENTS = 120;

function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Jira + git first (denser signal), then chat messages up to the cap. */
export function pickEvents(events: Evt[]): Evt[] {
  if (events.length <= MAX_EVENTS) return events;
  const strong = events.filter((e) => e.source === "jira" || e.source === "git" || e.source === "calendar");
  const chat = events.filter((e) => e.source === "matrix" || e.source === "confluence");
  const room = Math.max(0, MAX_EVENTS - strong.length);
  return [...strong.slice(0, MAX_EVENTS), ...chat.slice(0, room)].sort((a, b) => a.ts - b.ts);
}

const brief = (i?: IssueInfo) => (i ? { key: i.key, summary: i.summary } : undefined);

function pagesOf(c: IssueInfo, all: Record<string, IssueInfo>) {
  const pg = [c, c.parent ? all[c.parent] : undefined, c.epic ? all[c.epic] : undefined]
    .flatMap((i) => i?.pages ?? [])
    .slice(0, 3)
    .map((p) => ({ title: p.title, text: p.excerpt.slice(0, 250), children: p.children.length ? p.children.slice(0, 5) : undefined }));
  return pg.length ? pg : undefined;
}

/** A candidate task with the context around it (parent, epic, linked issues), as the AI sees it. */
export function describeIssue(c: IssueInfo, all: Record<string, IssueInfo>) {
  const linked = (c.links ?? []).map((k) => brief(all[k])).filter(Boolean).slice(0, 3);
  return {
    key: c.key,
    summary: c.summary,
    status: c.status,
    type: c.issueType || undefined,
    description: c.description ? c.description.slice(0, 300) : undefined,
    parent: brief(c.parent ? all[c.parent] : undefined),
    epic: brief(c.epic ? all[c.epic] : undefined),
    linked: linked.length ? linked : undefined,
    // Wiki pages of the task itself, its parent and its epic.
    pages: pagesOf(c, all),
  };
}

export function buildUserPrompt(
  date: string,
  events: Evt[],
  candidates: IssueInfo[],
  hoursPerDay: number,
  contextOnly: IssueInfo[] = [],
  all: Record<string, IssueInfo> = {},
): string {
  return JSON.stringify({
    date,
    hoursPerDay,
    contextOnly: contextOnly.map((c) => ({ key: c.key, summary: c.summary })),
    candidates: candidates.map((c) => describeIssue(c, all)),
    events: pickEvents(events).map((e) => ({
      time: hhmm(e.ts),
      src: e.source,
      key: e.issueKey,
      text: e.text.slice(0, 200),
      ctx: e.context ?? undefined,
      to: e.to ?? undefined,
    })),
  });
}

export interface AiDay {
  weights: Record<string, number>;
  notes: Record<string, string[]>;
  summary: string;
  reasoning: string;
}

/** Tolerant parser: strips code fences, ignores unknown keys and bad weights. */
export function parseAiDay(raw: string, allowed: Set<string>): AiDay | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(a, b + 1));
  } catch {
    return null;
  }
  const tasks = (obj as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return null;

  const weights: Record<string, number> = {};
  const notes: Record<string, string[]> = {};
  for (const t of tasks) {
    const key = typeof t?.key === "string" ? t.key.trim() : "";
    const w = Number(t?.weight);
    if (!allowed.has(key) || !Number.isFinite(w) || w <= 0) continue;
    weights[key] = (weights[key] ?? 0) + w;
    if (typeof t.note === "string" && t.note.trim()) (notes[key] ??= []).push(t.note.trim());
  }
  // An empty `tasks` is a valid answer ("nothing fits"), not a broken one.
  const summary = typeof (obj as { summary?: unknown }).summary === "string"
    ? ((obj as { summary: string }).summary).trim()
    : "";
  const reasoning = typeof (obj as { reasoning?: unknown }).reasoning === "string"
    ? ((obj as { reasoning: string }).reasoning).trim()
    : "";
  return { weights, notes, summary, reasoning };
}

/** System prompt for rewriting worklog descriptions, in the current language. */
export const notesSystemPrompt = (): string => t().analysis.prompt.notes;

/** One worklog row to rewrite: the AI's draft plus the day's events on that task. */
export interface NoteItem {
  id: string;
  date: string;
  key: string;
  task: string;
  hours: number;
  draft: string;
  facts: { src: string; text: string; ctx?: string }[];
}

export const buildNotesPrompt = (items: NoteItem[]): string =>
  JSON.stringify({ items: items.map(({ id, date, key, task, hours, draft, facts }) => ({ id, date, key, task, hours, draft: draft || undefined, facts })) });

/** id -> rewritten text, only for known ids; null when the answer is not usable at all. */
export function parseNotes(raw: string, allowed: Set<string>): Map<string, string> | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let items: unknown;
  try {
    items = (JSON.parse(raw.slice(a, b + 1)) as { items?: unknown }).items;
  } catch {
    return null;
  }
  if (!Array.isArray(items)) return null;
  const out = new Map<string, string>();
  for (const it of items) {
    const id = typeof it?.id === "string" ? it.id : "";
    const text = typeof it?.text === "string" ? it.text.trim() : "";
    if (allowed.has(id) && text) out.set(id, text);
  }
  return out;
}

export function buildNarrativePrompt(input: {
  start: string;
  end: string;
  hoursPerDay: number;
  totals: { key: string; summary: string; hours: number; days: number }[];
  days: { date: string; hours: number; basis: string; summary: string }[];
}): string {
  return JSON.stringify({
    period: `${input.start} .. ${input.end}`,
    hoursPerDay: input.hoursPerDay,
    totalHours: input.totals.reduce((s, t) => s + t.hours, 0),
    tasks: input.totals.slice(0, 15),
    days: input.days.slice(0, 31).map((d) => ({ ...d, summary: d.summary.slice(0, 160) })),
  });
}

export function parseNarrative(raw: string): string | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      const t = (JSON.parse(raw.slice(a, b + 1)) as { text?: unknown }).text;
      if (typeof t === "string" && t.trim()) return t.trim();
    } catch {
      /* fall through to raw text */
    }
  }
  const plain = raw.trim();
  return plain && !plain.startsWith("{") ? plain : null;
}
