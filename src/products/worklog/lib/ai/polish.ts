import { api } from "@/shared/api";
import type { DayPlan } from "@/shared/types";
import { mondayOf } from "@/shared/lib/dates";
import { buildNotesPrompt, notesSystemPrompt, parseNotes, type NoteItem } from "./prompt";
import { msg, pool } from "../analysis/format";
import type { RunContext } from "../analysis/types";

/** Enough rows for a week of several tasks, small enough for a short, reliable answer. */
const BATCH = 30;
const FACTS = 12;

const rowId = (date: string, key: string) => `${date}|${key}`;

/** Worklog rows of days built from own events, with the facts the description may rely on. */
function collect(days: DayPlan[], ctx: RunContext): NoteItem[] {
  const items: NoteItem[] = [];
  for (const d of days) {
    if (d.basis !== "activity") continue;
    for (const t of d.tasks) {
      if (t.hours <= 0) continue;
      const facts = d.evidence
        .filter((e) => e.key === t.key)
        .slice(0, FACTS)
        .map((e) => ({ src: e.source, text: e.text.slice(0, 160), ctx: e.context?.slice(0, 80) }));
      const draft = t.notes[0]?.trim() ?? "";
      if (!draft && facts.length === 0) continue;
      items.push({ id: rowId(d.date, t.key), date: d.date, key: t.key, task: ctx.issues[t.key]?.summary ?? "", hours: t.hours, draft, facts });
    }
  }
  return items;
}

/** Splits rows into batches that never cross a week, so one request sees a week's work together. */
function batches(items: NoteItem[]): NoteItem[][] {
  const byWeek = new Map<string, NoteItem[]>();
  for (const it of items) {
    const w = mondayOf(it.date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), it]);
  }
  const out: NoteItem[][] = [];
  for (const rows of byWeek.values()) for (let i = 0; i < rows.length; i += BATCH) out.push(rows.slice(i, i + BATCH));
  return out;
}

/**
 * Rewrites the per-task descriptions of days with own events into concrete, uniform worklog text.
 * Works in batches by week; a failed batch keeps the original notes.
 */
export async function polishNotes(ctx: RunContext, days: DayPlan[]): Promise<DayPlan[]> {
  const m = msg().polish;
  const items = collect(days, ctx);
  if (!ctx.aiOn || items.length === 0) return days;

  const groups = batches(items);
  ctx.log("info", m.asking(items.length, groups.length));
  const rewritten = new Map<string, string>();
  await pool(groups, 2, async (group) => {
    try {
      const raw = await api.llmChat(notesSystemPrompt(), buildNotesPrompt(group));
      const got = parseNotes(raw, new Set(group.map((g) => g.id)));
      if (!got) {
        ctx.log("warn", m.unparsed(raw.slice(0, 120).replace(/\s+/g, " ")));
        return;
      }
      for (const [id, text] of got) rewritten.set(id, text);
    } catch (e) {
      ctx.log("warn", m.error(String(e)));
    }
  });
  ctx.log(rewritten.size ? "ok" : "warn", m.done(rewritten.size, items.length));

  return days.map((d) => ({
    ...d,
    tasks: d.tasks.map((t) => {
      const text = rewritten.get(rowId(d.date, t.key));
      return text ? { ...t, notes: [text] } : t;
    }),
  }));
}
