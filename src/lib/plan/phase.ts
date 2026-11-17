import type { IssueInfo } from "../../types";
import { localDay } from "../events/days";
import type { DayActivity } from "./types";

/** Status of a task on a given day, from its Jira history; undefined when the history is unknown. */
export function statusOnDate(issue: IssueInfo | undefined, date: string): string | undefined {
  const tr = issue?.transitions;
  if (!tr || tr.length === 0) return undefined;
  const last = [...tr].reverse().find((t) => localDay(t.ts) <= date);
  return last ? last.to : tr[0].from || undefined;
}

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

const QA_STATUS = /test|qa|review|verif|ready|done|closed|resolved|тест|ревью|провер|готов|закрыт|выполнен|решен|решён/i;
const STATUS_CHANGE = /(?:status|статус)[^:;]*:\s*[^→;]*→\s*([^;]+)/i;

/** Where each task is in its life on a given day, judged by commit days and status changes. */
export class TaskTimeline {
  private gitDays: Record<string, string[]> = {};
  private statusAt: Record<string, { d: string; to: string }[]> = {};

  constructor(activity: Record<string, DayActivity>, private issues: Record<string, IssueInfo>) {
    for (const d of Object.keys(activity).sort()) {
      for (const e of activity[d].evidence) {
        if (!e.key) continue;
        if (e.source === "git") (this.gitDays[e.key] ??= []).push(d);
        if (e.source === "jira") {
          const m = STATUS_CHANGE.exec(e.text);
          if (m) (this.statusAt[e.key] ??= []).push({ d, to: m[1].trim() });
        }
      }
    }
  }

  phaseOf(key: string, date: string): Phase {
    const days = this.gitDays[key] ?? [];
    const before = days.some((d) => d < date);
    const after = days.some((d) => d > date);
    // The full Jira history (also changes made by QA or a lead) beats what only my own events show.
    const st = statusOnDate(this.issues[key], date) ?? [...(this.statusAt[key] ?? [])].reverse().find((x) => x.d <= date)?.to;
    if (st && QA_STATUS.test(st)) return "qa";
    if (before && !after) return "qa";
    if (before && after) return "dev";
    return "analysis";
  }
}
