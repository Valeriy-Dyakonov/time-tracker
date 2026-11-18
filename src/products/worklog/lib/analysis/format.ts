import { count, dateShort, t } from "@/i18n";
import type { Evt } from "@/shared/types";
import { weekdayName } from "@/shared/lib/dates";

export const msg = () => t().analysis;

export const sd = (d: string) => dateShort(d);

export const dayLabel = (d: string) => msg().days.label(sd(d), weekdayName(d));

export const nEv = (n: number) => count(n, msg().units.event);

export function countBy<T>(items: T[], f: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of items) m.set(f(x), (m.get(f(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export const joinCounts = (pairs: [string, number][], sep = " ") => pairs.map(([k, n]) => `${k}${sep}${n}`).join(", ");

export const bySource = (evs: Evt[]) => joinCounts(countBy(evs, (e) => e.source));

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
