import { getLocale, type Locale } from "./locale";

/** Plural forms: `one`/`other` for English, `one`/`few`/`many` for Russian (`other` is the fallback). */
export interface PluralForms { one: string; few?: string; many?: string; other: string }

const rules = new Map<Locale, Intl.PluralRules>();

export function plural(n: number, forms: PluralForms, locale: Locale = getLocale()): string {
  let r = rules.get(locale);
  if (!r) rules.set(locale, (r = new Intl.PluralRules(locale)));
  const cat = r.select(n) as keyof PluralForms;
  return forms[cat] ?? forms.other;
}

/** `n` followed by the matching word form: "3 дня", "1 day". */
export const count = (n: number, forms: PluralForms): string => `${n} ${plural(n, forms)}`;

const WEEKDAYS: Record<Locale, string[]> = {
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};
const MONTHS_SHORT: Record<Locale, string[]> = {
  ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const MONTHS: Record<Locale, string[]> = {
  ru: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const MONTHS_OF: Record<Locale, string[]> = {
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  en: MONTHS.en,
};

/** 1 = Monday ... 7 = Sunday. */
export const weekdayShort = (isoDay: number): string => WEEKDAYS[getLocale()][isoDay - 1];
export const weekdaysShort = (): string[] => WEEKDAYS[getLocale()];
export const monthShortName = (m: number): string => MONTHS_SHORT[getLocale()][m];
export const monthName = (m: number): string => MONTHS[getLocale()][m];

/** "5 ноября" / "November 5" (with the year when asked). */
export function dayMonth(d: Date, withYear = false): string {
  const y = withYear ? ` ${d.getFullYear()}` : "";
  return getLocale() === "ru" ? `${d.getDate()} ${MONTHS_OF.ru[d.getMonth()]}${y}` : `${MONTHS_OF.en[d.getMonth()]} ${d.getDate()}${withYear ? "," + y : ""}`;
}

/** Hours as written in the UI: comma decimal separator in Russian, dot in English. */
export const hours = (h: number): string => {
  const s = (Math.round(h * 100) / 100).toString();
  return getLocale() === "ru" ? s.replace(".", ",") : s;
};

const ymd = (s: string) => s.split("-").map(Number);

/** "05.11" / "Nov 5" — day and month of a YYYY-MM-DD date. */
export function dateShort(s: string): string {
  const [, m, d] = ymd(s);
  return getLocale() === "ru" ? `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}` : `${MONTHS_SHORT.en[m - 1]} ${d}`;
}

/** "05.11.2026" / "Nov 5, 2026". */
export function dateFull(s: string): string {
  const [y, m, d] = ymd(s);
  return getLocale() === "ru" ? `${dateShort(s)}.${y}` : `${MONTHS_SHORT.en[m - 1]} ${d}, ${y}`;
}

/** Declares plural forms in a message file so other locales may list a different set of forms. */
export const forms = (f: PluralForms): PluralForms => f;
