import type { Evt } from "../../types";

const KEY_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;

export function findKeys(...texts: (string | null | undefined)[]): string[] {
  const found: string[] = [];
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(KEY_RE)) if (!found.includes(m[0])) found.push(m[0]);
  }
  return found;
}

/** Well-known non-Jira tokens that look like issue keys ("UTF-8", "SHA-256", "RFC-2616"...). */
const NOT_PROJECTS = /^(UTF|ISO|RFC|SHA|MD|CVE|TLS|SSL|AES|RSA|HTTP|HTTPS|PDF|USB|IPV|GOST|ES|X)-/;
export const isPlausibleKey = (k: string): boolean => !NOT_PROJECTS.test(k);

export const projectOf = (key: string): string => key.split("-")[0].toUpperCase();

/**
 * Cheap pre-filter for chat messages: short replies, greetings and emoji-only lines are small talk.
 * A message with an issue key is always kept; the rest is judged by the AI (see prompt rules).
 */
export function isWorkMessage(text: string): boolean {
  const t = text.trim();
  if (findKeys(t).length > 0) return true;
  if (t.length < 25) return false;
  if (!/[A-Za-zА-Яа-яЁё]{3,}/.test(t)) return false;
  return !/^(привет|добрый (день|вечер|утро)|доброе утро|хорошего|спасибо|благодарю|с днём|с днем|hi\b|hello|hey\b|good (morning|afternoon|evening)|thanks|thank you)/i.test(t) || t.length > 80;
}

/** Commits and chat messages carry the key in their text, branch or room name rather than in a field. */
export function attachKeys(events: Evt[]): Evt[] {
  return events.map((e) => {
    if (e.issueKey) return e;
    const [k] = findKeys(e.text, e.context);
    return k ? { ...e, issueKey: k } : e;
  });
}
