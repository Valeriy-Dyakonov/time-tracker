import type { DayPlan, Evidence, Evt, FillMode, IssueInfo, Meeting, TaskHours } from "../types";
import { dayBounds, eachDate, formatRu, isoWeekday, localDate } from "./dates";

export const STEP = 0.25;

export function round(n: number, step = STEP): number {
  return Math.round(n / step) * step;
}

/**
 * Splits `total` hours between keys proportionally to `weights`, in multiples of
 * `step`, so that the result sums to exactly `total` (largest remainder method).
 */
export function distribute(
  weights: Record<string, number>,
  total: number,
  step = STEP,
): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => Number.isFinite(w) && w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  if (entries.length === 0 || sum <= 0 || total <= 0) return {};

  const units = Math.round(total / step);
  const parts = entries.map(([key, w]) => {
    const x = (w / sum) * units;
    return { key, n: Math.floor(x), frac: x - Math.floor(x) };
  });
  let left = units - parts.reduce((s, p) => s + p.n, 0);
  const byFrac = [...parts].sort((a, b) => b.frac - a.frac);
  for (let i = 0; left > 0; i = (i + 1) % byFrac.length) {
    byFrac[i].n += 1;
    left -= 1;
  }
  const out: Record<string, number> = {};
  for (const p of parts.sort((a, b) => b.n - a.n)) {
    if (p.n > 0) out[p.key] = p.n * step;
  }
  return out;
}

const KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;

export function findKeys(...texts: (string | null | undefined)[]): string[] {
  const found: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(KEY_RE)) if (!found.includes(m[0])) found.push(m[0]);
  }
  return found;
}

/** Well-known non-Jira tokens that look like issue keys ("UTF-8", "SHA-256", "RFC-2616"...). */
const NOT_PROJECTS = /^(UTF|ISO|RFC|SHA|MD|CVE|TLS|SSL|AES|RSA|HTTP|HTTPS|PDF|USB|IPV|GOST|ES|X)-/;
export const isPlausibleKey = (k: string): boolean => !NOT_PROJECTS.test(k);

/** Project prefix of a key: "PAY-12" -> "PAY". */
export const projectOf = (key: string): string => key.split("-")[0].toUpperCase();

/**
 * Cheap pre-filter for chat messages: short replies, greetings and emoji-only lines are small talk.
 * A message with an issue key is always kept; the rest is judged by the AI (see prompt rules).
 */
export function isWorkMessage(text: string): boolean {
  const t = text.trim();
  if (findKeys(t).length > 0) return true;
  if (t.length < 25) return false;
  if (!/[A-Za-zА-Яа-яЁё]{3,}/.test(t)) return false;
  return !/^(привет|добрый (день|вечер|утро)|доброе утро|хорошего|спасибо|благодарю|с днём|с днем)/i.test(t) || t.length > 80;
}

/** Fills `issueKey` for git commits / chat messages by looking for keys in text, branch and room name. */
export function attachKeys(events: Evt[]): Evt[] {
  return events.map((e) => {
    if (e.issueKey) return e;
    const [k] = findKeys(e.text, e.context);
    return k ? { ...e, issueKey: k } : e;
  });
}

/** Rough effort of a single event, used when AI is off or unavailable. */
export function eventScore(e: Evt): number {
  if (e.source === "jira") return 2;
  if (e.source === "git") return 1 + 1.5 * Math.log10(1 + e.weight);
  if (e.source === "calendar") return 0.5 + e.weight / 60; // weight = minutes; counts only when the title has a task key
  return 0.5;
}

export function heuristicWeights(events: Evt[], exclude: (key: string) => boolean = () => false): Record<string, number> {
  const w: Record<string, number> = {};
  for (const e of events) {
    if (!e.issueKey || exclude(e.issueKey)) continue;
    w[e.issueKey] = (w[e.issueKey] ?? 0) + eventScore(e);
  }
  return w;
}

export interface DayActivity {
  weights: Record<string, number>;
  notes: Record<string, string[]>;
  summary: string;
  reasoning: string;
  evidence: Evidence[];
  eventCount: number;
}

export function localDay(ts: number): string {
  return localDate(new Date(ts));
}

export function groupByDay(events: Evt[]): Record<string, Evt[]> {
  const out: Record<string, Evt[]> = {};
  for (const e of events) (out[localDay(e.ts)] ??= []).push(e);
  for (const d of Object.keys(out)) out[d].sort((a, b) => a.ts - b.ts);
  return out;
}

export function workDates(
  start: string,
  end: string,
  workdays: number[],
  today: string,
): string[] {
  return eachDate(start, end).filter((d) => workdays.includes(isoWeekday(d)) && d <= today);
}

function toTasks(
  hours: Record<string, number>,
  notes: Record<string, string[]>,
): TaskHours[] {
  return Object.entries(hours).map(([key, h]) => ({ key, hours: h, notes: notes[key] ?? [] }));
}

export function autoSummary(tasks: TaskHours[], issues: Record<string, IssueInfo>): string {
  return tasks
    .slice(0, 4)
    .map((t) => `${t.key}${issues[t.key] ? " " + issues[t.key].summary : ""}`)
    .join("; ");
}

const short = (d: string) => formatRu(d).slice(0, 5);

/** Where a task is in its life, judged by the commits and status changes seen in the period. */
export type Phase = "analysis" | "dev" | "qa";

/**
 * Neutral wording for days that have no traces: what a person really does on a task without leaving commits.
 * Deliberately generic (no invented results, bugs or deliverables), but matched to the stage of the task:
 * before the first commit it is analysis, between commits it is development, after the last commit it is
 * testing, QA support and environment problems.
 */
const FILLER: Record<Phase, string[]> = {
  analysis: [
    "Анализ задачи и изучение контекста",
    "Проработка требований, уточнение деталей",
    "Изучение связанных задач и документации",
    "Анализ существующего решения, подготовка подхода",
    "Обсуждение деталей реализации, проработка решения",
    "Планирование работ по задаче",
  ],
  dev: [
    "Работа над реализацией, отладка",
    "Доработка решения, проверка на локальном окружении",
    "Рефакторинг и подготовка изменений по задаче",
    "Отладка и проверка граничных случаев",
    "Обсуждение деталей реализации с командой",
  ],
  qa: [
    "Тестирование, проверка результата",
    "Поддержка QA: разбор вопросов по задаче",
    "Решение проблем окружения и стенда при тестировании",
    "Проверка на тестовом стенде, разбор результатов тестирования",
    "Подготовка к релизу, проверка результата",
    "Анализ и устранение инфраструктурных проблем при тестировании",
  ],
};

export const PHASE_LABEL: Record<Phase, string> = { analysis: "анализ", dev: "разработка", qa: "после разработки (тестирование, поддержка QA)" };

export function fillerNote(key: string, n: number, issues: Record<string, IssueInfo>, phase: Phase = "analysis"): string {
  const i = issues[key];
  const parent = i?.epic ?? i?.parent;
  const pt = phase !== "qa" && parent ? issues[parent]?.summary : "";
  const list = FILLER[phase];
  const h = [...key].reduce((s, c) => s + c.charCodeAt(0), 0);
  const idx = (h + n) % (list.length + (pt ? 1 : 0));
  return pt && idx === list.length ? `Проработка задачи в рамках «${pt.slice(0, 80)}»` : list[idx];
}

export function toEvidence(events: Evt[], max = 200): Evidence[] {
  return events.slice(0, max).map((e) => ({
    ts: e.ts,
    source: e.source,
    key: e.issueKey,
    text: (e.source === "calendar" && e.context ? `${e.text} (${e.context})` : e.text).slice(0, 180),
  }));
}

function normalized(w: Record<string, number>): Record<string, number> {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return sum > 0 ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum])) : {};
}

function listTasks(tasks: TaskHours[]): string {
  return tasks.map((t) => `${t.key} (${t.hours} ч)`).join(", ");
}

/**
 * Builds the per-day plan so that every working day adds up to `hoursPerDay`.
 * Days without usable activity are filled according to `fillMode` and marked "inferred":
 *  - neighbors: copy the task mix of the nearest day with activity (previous first, then next);
 *  - period:    split proportionally to the tasks of the whole period;
 *  - none:      leave empty.
 */
export function buildPlan(
  dates: string[],
  activity: Record<string, DayActivity>,
  issues: Record<string, IssueInfo>,
  hoursPerDay: number,
  fillMode: FillMode = "neighbors",
  meetings: Record<string, Meeting[]> = {},
): DayPlan[] {
  const active = Object.keys(activity)
    .filter((d) => Object.keys(activity[d].weights).length > 0)
    .sort();

  // A task cannot be worked on before it was created or after it was resolved.
  const alive = (key: string, date: string): boolean => {
    const i = issues[key];
    if (!i) return true;
    const [s, e] = dayBounds(date);
    return !((i.created && i.created >= e) || (i.resolved && i.resolved < s));
  };
  const aliveOnly = (w: Record<string, number>, date: string) =>
    Object.fromEntries(Object.entries(w).filter(([k]) => alive(k, date)));
  // Timeline of each task from the evidence of the days that do have data: commits and status changes.
  const gitDays: Record<string, string[]> = {};
  const statusAt: Record<string, { d: string; to: string }[]> = {};
  for (const d of Object.keys(activity).sort()) {
    for (const e of activity[d].evidence) {
      if (!e.key) continue;
      if (e.source === "git") (gitDays[e.key] ??= []).push(d);
      if (e.source === "jira") {
        const m = /(?:status|статус)[^:;]*:\s*[^→;]*→\s*([^;]+)/i.exec(e.text);
        if (m) (statusAt[e.key] ??= []).push({ d, to: m[1].trim() });
      }
    }
  }
  const QA_STATUS = /test|qa|review|verif|ready|done|closed|resolved|тест|ревью|провер|готов|закрыт|выполнен|решен|решён/i;
  const phaseOf = (key: string, date: string): Phase => {
    const before = (gitDays[key] ?? []).some((d) => d < date);
    const after = (gitDays[key] ?? []).some((d) => d > date);
    const st = [...(statusAt[key] ?? [])].reverse().find((x) => x.d <= date);
    if (st && QA_STATUS.test(st.to)) return "qa";
    if (before && !after) return "qa";
    if (before && after) return "dev";
    return "analysis";
  };
  const fillN: Record<string, number> = {};
  let lastPhases = "";
  const withFiller = (tasks: TaskHours[], date: string): TaskHours[] => {
    const ph: string[] = [];
    const out = tasks.map((t) => {
      const phase = phaseOf(t.key, date);
      ph.push(`${t.key}: ${PHASE_LABEL[phase]}`);
      return { ...t, notes: [fillerNote(t.key, (fillN[t.key] = (fillN[t.key] ?? -1) + 1), issues, phase)] };
    });
    lastPhases = ph.join("; ");
    return out;
  };

  // Whole-period mix: each active day counts equally, so one huge day does not dominate.
  const periodWeights: Record<string, number> = {};
  for (const d of active)
    for (const [k, v] of Object.entries(normalized(activity[d].weights)))
      periodWeights[k] = (periodWeights[k] ?? 0) + v;

  return dates.map((date): DayPlan => {
    const own = activity[date];
    const base = {
      date,
      target: hoursPerDay,
      off: false,
      eventCount: own?.eventCount ?? 0,
      evidence: own?.evidence ?? [],
      meetings: meetings[date] ?? [],
    };

    if (own && Object.keys(own.weights).length > 0) {
      const tasks = toTasks(distribute(own.weights, hoursPerDay), own.notes);
      return {
        ...base,
        tasks,
        basis: "activity",
        summary: own.summary || autoSummary(tasks, issues),
        reasoning: own.reasoning,
      };
    }

    const onlyMeetings = (meetings[date]?.length ?? 0) > 0 && !own;
    const aiSaid = own?.reasoning ? ` ${own.reasoning}` : "";
    const noEvents = own
      ? `События за этот день не удалось привязать ни к одной задаче, на которую начисляются часы.${aiSaid}`
      : onlyMeetings
        ? "В этот день были только звонки и встречи — по ним задачу определить нельзя."
        : "За этот день нет ни действий в Jira, ни коммитов, ни сообщений.";

    if (fillMode === "none" || active.length === 0) {
      return {
        ...base,
        tasks: [],
        basis: "empty",
        summary: "",
        reasoning: `${noEvents} День оставлен пустым${active.length === 0 ? ": во всём периоде нет данных для распределения" : " по выбранному режиму"}.`,
      };
    }

    const periodFor = (): Record<string, number> => {
      const w = aliveOnly(periodWeights, date);
      return Object.keys(w).length ? w : periodWeights;
    };

    if (fillMode === "period") {
      const tasks = withFiller(toTasks(distribute(periodFor(), hoursPerDay), {}), date);
      return {
        ...base,
        tasks,
        basis: "inferred",
        summary: autoSummary(tasks, issues),
        reasoning: `${noEvents} Часы распределены пропорционально задачам всего периода: ${listTasks(tasks)}.`,
      };
    }

    // Nearest earlier day with activity first, then later ones; only tasks that existed and were open that day.
    const order = [...[...active].reverse().filter((d) => d < date), ...active.filter((d) => d > date)];
    let src: string | undefined;
    let mix: Record<string, number> = {};
    for (const d of order) {
      const w = aliveOnly(activity[d].weights, date);
      if (Object.keys(w).length) { src = d; mix = w; break; }
    }
    if (!src) {
      const tasks = withFiller(toTasks(distribute(periodFor(), hoursPerDay), {}), date);
      return {
        ...base,
        tasks,
        basis: "inferred",
        summary: autoSummary(tasks, issues),
        reasoning: `${noEvents} Подходящих соседних дней нет — часы распределены по задачам всего периода: ${listTasks(tasks)}.`,
      };
    }
    const tasks = withFiller(toTasks(distribute(mix, hoursPerDay), {}), date);
    return {
      ...base,
      tasks,
      basis: "inferred",
      inferredFrom: src,
      summary: autoSummary(tasks, issues),
      reasoning: `${noEvents} Взято по ${src < date ? "предыдущему" : "следующему"} дню с активностью — ${short(src)}: ${listTasks(tasks)}. Описание типовое, по этапу задачи (${lastPhases}): за этот день нет следов работы.`,
    };
  });
}

export function dayTotal(d: DayPlan): number {
  return d.off ? 0 : d.tasks.reduce((s, t) => s + t.hours, 0);
}

/** Rescales the day's tasks back to its target, keeping their proportions. */
export function rebalance(d: DayPlan): DayPlan {
  const w: Record<string, number> = {};
  for (const t of d.tasks) w[t.key] = t.hours;
  const h = distribute(w, d.target);
  const notes: Record<string, string[]> = {};
  for (const t of d.tasks) notes[t.key] = t.notes;
  return { ...d, tasks: toTasks(h, notes) };
}
