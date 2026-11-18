import { api } from "@/shared/api";
import type { DayProgress, Evt } from "@/shared/types";
import { addDays } from "@/shared/lib/dates";
import { toEvidence } from "../events/days";
import { heuristicWeights } from "../plan/heuristic";
import type { DayActivity } from "../plan/types";
import { buildUserPrompt, dayPrompt, parseAiDay } from "../ai/prompt";
import { countBy, joinCounts, msg, percents, sd } from "./format";
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
    const c = joinCounts(countBy(evs.filter((e) => e.issueKey === k), (e) => e.source), ": ");
    return `${k} (${c})`;
  });
  return msg().alloc.heuristicReasoning(why, parts.join("; "), evs.filter((e) => !e.issueKey).length);
}

function heuristicActivity(ctx: RunContext, evs: Evt[], why: string): DayActivity {
  const weights = heuristicWeights(evs, ctx.isCtx);
  return { weights, notes: {}, summary: "", eventCount: evs.length, evidence: toEvidence(evs), reasoning: heuristicReasoning(evs, weights, why) };
}

/** Weights by task keys found in the events. */
export class HeuristicAllocator implements DayAllocator {
  constructor(private ctx: RunContext) {}

  async allocate({ label, events }: DayInput): Promise<DayResult> {
    const act = heuristicActivity(this.ctx, events, msg().alloc.aiOff);
    this.ctx.log("info", msg().alloc.heuristic(label, percents(act.weights)));
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
    const m = msg().alloc;
    const { candidates, contextOnly } = this.candidates(date, byDay);
    if (candidates.length === 0) {
      ctx.log("warn", m.noCandidates(label));
      return this.fallback(evs, m.noCandidatesWhy, m.noCandidatesNote);
    }

    ctx.log("info", m.asking(label, candidates.length));
    const t0 = performance.now();
    let raw: string;
    try {
      raw = await api.llmChat(dayPrompt(), buildUserPrompt(date, evs, candidates, normFor(ctx, date), contextOnly, ctx.issues));
    } catch (e) {
      ctx.log("error", m.aiError(label, String(e)));
      ctx.warnings.push(m.aiErrorWarning(sd(date), String(e)));
      return this.fallback(evs, m.aiErrorWhy, m.aiErrorNote);
    }
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    const parsed = parseAiDay(raw, new Set(candidates.map((c) => c.key)));

    if (!parsed) {
      ctx.log("warn", m.unparsed(label, raw.slice(0, 120).replace(/\s+/g, " ")));
      ctx.warnings.push(m.unparsedWarning(sd(date)));
      return this.fallback(evs, m.unparsedWhy, m.unparsedNote);
    }
    if (Object.keys(parsed.weights).length > 0) {
      ctx.log("ok", m.aiDone(label, sec, percents(parsed.weights), parsed.summary));
      return { act: { ...parsed, eventCount: evs.length, evidence: toEvidence(evs) }, status: "done", usedAi: true };
    }

    // A valid answer where no candidate fits: keep the AI's explanation, take weights from task keys.
    const heur = heuristicWeights(evs, ctx.isCtx);
    const hasKeys = Object.keys(heur).length > 0;
    const said = parsed.reasoning || parsed.summary;
    ctx.log("info", m.aiNoTask(label, sec, said.slice(0, 160), hasKeys));
    return {
      act: { weights: heur, notes: {}, summary: parsed.summary, reasoning: said || m.aiNoTaskReason, eventCount: evs.length, evidence: toEvidence(evs) },
      status: hasKeys ? "fallback" : "done",
      note: m.aiNoTaskNote,
      usedAi: false,
    };
  }
}

export const dayAllocator = (ctx: RunContext): DayAllocator => (ctx.aiOn ? new AiAllocator(ctx) : new HeuristicAllocator(ctx));
