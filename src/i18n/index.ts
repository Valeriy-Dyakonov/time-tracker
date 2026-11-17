import { en } from "./messages/en";
import { ru } from "./messages/ru";
import { getLocale, useLocale, type Locale } from "./locale";

export type Messages = typeof ru;

const CATALOG: Record<Locale, Messages> = { ru, en };

/** Messages of the current locale, for code outside React (analysis, exports). */
export const t = (): Messages => CATALOG[getLocale()];

/** Messages of the current locale; re-renders the component when the language changes. */
export function useT(): Messages {
  return CATALOG[useLocale()];
}

export * from "./format";
export { LOCALES, getLocale, setLocale, useLocale, applyLocale, type Locale } from "./locale";
