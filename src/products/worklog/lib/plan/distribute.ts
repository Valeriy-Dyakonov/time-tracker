import type { DayPlan, TaskHours } from "@/shared/types";

export const STEP = 0.25;

export function round(n: number, step = STEP): number {
  return Math.round(n / step) * step;
}

/**
 * Splits `total` hours between keys proportionally to `weights`, in multiples of
 * `step`, so that the result sums to exactly `total` (largest remainder method).
 */
export function distribute(weights: Record<string, number>, total: number, step = STEP): Record<string, number> {
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

export function normalized(w: Record<string, number>): Record<string, number> {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return sum > 0 ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum])) : {};
}

export function toTasks(hours: Record<string, number>, notes: Record<string, string[]>): TaskHours[] {
  return Object.entries(hours).map(([key, h]) => ({ key, hours: h, notes: notes[key] ?? [] }));
}

export function dayTotal(d: DayPlan): number {
  return d.off ? 0 : d.tasks.reduce((s, t) => s + t.hours, 0);
}

/** Rescales the day's tasks back to its target, keeping their proportions. */
export function rebalance(d: DayPlan): DayPlan {
  const w: Record<string, number> = {};
  for (const t of d.tasks) w[t.key] = t.hours;
  const notes: Record<string, string[]> = {};
  for (const t of d.tasks) notes[t.key] = t.notes;
  return { ...d, tasks: toTasks(distribute(w, d.target), notes) };
}
