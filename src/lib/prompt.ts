import type { Evt, IssueInfo } from "../types";
import { pad } from "./dates";

export const SYSTEM_PROMPT = `Ты помощник по учёту рабочего времени разработчика.
Тебе дают события ОДНОГО рабочего дня (действия в Jira, коммиты git, сообщения в чате) и список задач-кандидатов из Jira.
Определи, над какими задачами человек работал в этот день и в каких относительных долях трудозатрат.

Верни ТОЛЬКО JSON без пояснений и без markdown:
{"tasks":[{"key":"ABC-1","weight":0.6,"note":"что именно сделано, до 100 символов"}],"summary":"1-2 коротких предложения о том, чем занимался в этот день (для отчёта)","reasoning":"2-4 предложения простым языком: какие именно события (коммиты, переходы статусов, комментарии, сообщения, страницы) определили выбор задач и почему доли такие; отдельно скажи, что отнесено по смыслу, а что неясно"}

Правила:
- Используй только ключи из списка кандидатов.
- weight — относительная доля трудозатрат (числа не обязаны давать в сумме 1). Больше коммитов, обсуждений и переходов статусов по задаче — больше вес.
- События без ключа (коммиты, сообщения чата) отнеси к наиболее подходящей задаче по смыслу. Если уверенности нет — не учитывай их.
- События src=calendar — встречи и звонки из календаря (в ctx время и длительность). Используй их как контекст: тема встречи может указывать на задачу. Их время уже входит в рабочий день, отдельно вычитать его не нужно.
- Сообщения чата (src=matrix) учитывай только если они по работе: обсуждение задач, кода, багов, релизов, решений, согласований. Приветствия, бытовые и личные темы, обычное общение игнорируй.
- У кандидатов могут быть description, parent, epic и linked — это родительская задача, эпик и связанные тикеты. Используй их, чтобы понять смысл коммитов и сообщений без ключа.
- pages — страницы Confluence, связанные с задачей, её родителем или эпиком (название, начало текста, дочерние страницы). Это справка о предмете работы, а не событие дня.
- Сопоставляй события по времени: сообщение чата, звонок или комментарий рядом по времени с коммитами на ту же тему относятся к той же задаче.
- События src=gitlab — работа с merge request в GitLab: создание, слияние, одобрение и комментарии в ревью. Ревью чужого MR — тоже рабочее время, относи его к задаче из названия, ветки или описания MR (они в text и ctx). Если ключа нет, определи задачу по смыслу или не учитывай.
- Задачи из contextOnly — только контекст: НЕ включай их в tasks (время на них не списывается), но используй, чтобы понять, чем занимался человек.
- Если ни одна задача-кандидат не подходит — верни пустой tasks и объясни в reasoning, что было сделано.
- Не выдумывай работу, которой нет в событиях. Пиши по-русски, note и summary — деловым стилем, как описание для отчёта.
- Не пытайся подгонять веса под длину рабочего дня.`;

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

export const NARRATIVE_SYSTEM = `Ты помощник по учёту рабочего времени.
Тебе дают итоги периода: суммарные часы по задачам и короткие описания дней.
Напиши для сотрудника связный рассказ простым деловым русским языком, 5-9 предложений, без markdown и списков:
над чем в основном шла работа, как распределилось время, какие задачи заняли больше всего, были ли дни, заполненные без данных (basis = inferred).
Не выдумывай ничего, чего нет во входных данных.
Верни ТОЛЬКО JSON: {"text":"..."}`;

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
