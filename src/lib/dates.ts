export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // noon: immune to DST shifts
}

/** 1 = Monday ... 7 = Sunday */
export function isoWeekday(s: string): number {
  return ((parseDate(s).getDay() + 6) % 7) + 1;
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function mondayOf(s: string): string {
  return addDays(s, -(isoWeekday(s) - 1));
}

export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function weekdayName(s: string): string {
  return WEEKDAYS_SHORT[isoWeekday(s) - 1];
}

export function formatRu(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

export function monthRange(offset: number, now = new Date()): { start: string; end: string } {
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 12);
  return { start: localDate(first), end: localDate(last) };
}

/** Russian plural: plural(5, "событие", "события", "событий") */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export const monthShort = (s: string): string => MONTHS_SHORT[parseDate(s).getMonth()];

/** [start, end) of a local calendar day in ms. */
export function dayBounds(s: string): [number, number] {
  const [y, m, d] = s.split("-").map(Number);
  const a = new Date(y, m - 1, d).getTime();
  return [a, new Date(y, m - 1, d + 1).getTime()];
}
