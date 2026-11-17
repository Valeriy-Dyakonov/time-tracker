import { api } from "../../api";
import type { DayProgress, Evt } from "../../types";
import { addDays } from "../dates";
import { toEvidence } from "../events/days";
import { heuristicWeights } from "../plan/heuristic";
import type { DayActivity } from "../plan/types";
import { buildUserPrompt, parseAiDay, SYSTEM_PROMPT } from "../prompt";
import { countBy, percents, sd } from "./format";
import { normFor, type RunContext } from "./types";

export interface DayInput {
  date: string;
  label: string;
  events: Evt[];
  byDay: Record<string, Evt[]>;
}

export interface DayResult {
  act: DayActivity;
  status: DayProgress["status"];
  note?: string;
  usedAi: boolean;
}

/** How the hours of a day with events are split between tasks (Strategy). */
export interface DayAllocator {
  allocate(day: DayInput): Promise<DayResult>;
}

/** Plain-language explanation for days analysed without AI. */
function heuristicReasoning(evs: Evt[], weights: Record<string, number>, why: string): string {
  const parts = Object.keys(weights).map((k) => {
    const c = countBy(evs.filter((e) => e.issueKey === k), (e) => e.source).map(([s, n]) => `${s}: ${n}`).join(", ");
    return `${k} (${c})`;
  });
  const unkeyed = evs.filter((e) => !e.issueKey).length;
  return (
    `${why} Доли посчитаны по числу и размеру действий с ключом задачи: ${parts.join("; ")}.` +
    (unkeyed ? ` Ещё ${unkeyed} событий без ключа задачи в расчёте не участвуют.` : "")
  );
}

function heuristicActivity(ctx: RunContext, evs: Evt[], why: string): DayActivity {
  const weights = heuristicWeights(evs, ctx.isCtx);
  return { weights, notes: {}, summary: "", eventCount: evs.length, evidence: toEvidence(evs), reasoning: heuristicReasoning(evs, weights, why) };
}

/** Weights by task keys found in the events. */
export class HeuristicAllocator implements DayAllocator {
  constructor(private ctx: RunContext) {}

  async allocate({ label, events }: DayInput): Promise<DayResult> {
    const act = heuristicActivity(this.ctx, events, "Анализ ИИ выключен.");
    this.ctx.log("info", `${label}: эвристика → ${percents(act.weights) || "нет событий с ключом задачи"}.`);
    return { act, status: "done", usedAi: false };
  }
}

/** Asks the AI which nearby tasks the events belong to; falls back to the heuristic on any trouble. */
export class AiAllocator implements DayAllocator {
  constructor(private ctx: RunContext) {}

  private candidates(date: string, byDay: Record<string, Evt[]>) {
    const { issues, isCtx, enrich } = this.ctx;
    const near = new Set<string>();
    for (let k = -3; k <= 3; k++)
      for (const e of byDay[addDays(date, k)] ?? []) if (e.issueKey) near.add(e.issueKey);
    if (near.size < 3) for (const k of Object.keys(issues).filter((x) => !enrich.contextParents.has(x)).slice(0, 10)) near.add(k);
    return {
      candidates: [...near].filter((k) => !isCtx(k)).map((k) => issues[k]).filter(Boolean),
      contextOnly: [...near].filter(isCtx).map((k) => issues[k]).filter(Boolean),
    };
  }

  private fallback(evs: Evt[], why: string, note: string): DayResult {
    return { act: heuristicActivity(this.ctx, evs, why), status: "fallback", note, usedAi: false };
  }

  async allocate({ date, label, events: evs, byDay }: DayInput): Promise<DayResult> {
    const { ctx } = this;
    const { candidates, contextOnly } = this.candidates(date, byDay);
    if (candidates.length === 0) {
      ctx.log("warn", `${label}: нет задач-кандидатов — ИИ не вызывался.`);
      return this.fallback(evs, "ИИ не использовался для этого дня.", "нет задач-кандидатов");
    }

    ctx.log("info", `${label}: → запрос к ИИ (кандидатов: ${candidates.length})…`);
    const t0 = performance.now();
    let raw: string;
    try {
      raw = await api.llmChat(SYSTEM_PROMPT, buildUserPrompt(date, evs, candidates, normFor(ctx, date), contextOnly, ctx.issues));
    } catch (e) {
      ctx.log("error", `${label}: ошибка ИИ — ${e}. Использована эвристика.`);
      ctx.warnings.push(`${sd(date)}: ошибка ИИ (${e}), использована эвристика.`);
      return this.fallback(evs, "ИИ не ответил.", "ошибка ИИ");
    }
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    const parsed = parseAiDay(raw, new Set(candidates.map((c) => c.key)));

    if (!parsed) {
      ctx.log("warn", `${label}: ответ ИИ не удалось разобрать — использована эвристика. Начало ответа: ${raw.slice(0, 120).replace(/\s+/g, " ")}`);
      ctx.warnings.push(`${sd(date)}: непонятный ответ ИИ, использована эвристика.`);
      return this.fallback(evs, "Ответ ИИ не удалось разобрать.", "непонятный ответ ИИ");
    }
    if (Object.keys(parsed.weights).length > 0) {
      ctx.log("ok", `${label}: ИИ за ${sec} с → ${percents(parsed.weights)}${parsed.summary ? ` — «${parsed.summary}»` : ""}`);
      return { act: { ...parsed, eventCount: evs.length, evidence: toEvidence(evs) }, status: "done", usedAi: true };
    }

    // A valid answer where no candidate fits: keep the AI's explanation, take weights from task keys.
    const heur = heuristicWeights(evs, ctx.isCtx);
    const hasKeys = Object.keys(heur).length > 0;
    const said = parsed.reasoning || parsed.summary;
    ctx.log("info", `${label}: ИИ за ${sec} с не нашёл подходящей задачи${said ? ` — «${said.slice(0, 160)}»` : ""}.${hasKeys ? " Использованы доли по ключам задач." : " День будет заполнен по режиму «дни без данных»."}`);
    return {
      act: { weights: heur, notes: {}, summary: parsed.summary, reasoning: said || "ИИ не нашёл подходящей задачи.", eventCount: evs.length, evidence: toEvidence(evs) },
      status: hasKeys ? "fallback" : "done",
      note: "ИИ: нет подходящей задачи",
      usedAi: false,
    };
  }
}

export const dayAllocator = (ctx: RunContext): DayAllocator => (ctx.aiOn ? new AiAllocator(ctx) : new HeuristicAllocator(ctx));
