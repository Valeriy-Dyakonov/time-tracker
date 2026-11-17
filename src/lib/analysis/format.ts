import type { Evt } from "../../types";
import { formatRu, plural } from "../dates";

export const sd = (d: string) => formatRu(d).slice(0, 5);

export const nEv = (n: number) => `${n} ${plural(n, "событие", "события", "событий")}`;

export function countBy<T>(items: T[], f: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of items) m.set(f(x), (m.get(f(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export const bySource = (evs: Evt[]) => countBy(evs, (e) => e.source).map(([s, n]) => `${s} ${n}`).join(", ");

export function percents(weights: Record<string, number>): string {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([k, w]) => `${k} ${Math.round((w / sum) * 100)}%`)
    .join(" · ");
}

export const listHead = (keys: string[], n = 6) => `${keys.slice(0, n).join(", ")}${keys.length > n ? "…" : ""}`;

export async function pool<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}
