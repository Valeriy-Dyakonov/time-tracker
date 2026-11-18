/** Priority names differ between installations; their level is read from the name (English or Russian). */
export type PriorityLevel = "top" | "high" | "mid" | "low";

const has = (name: string, words: string[]) => words.some((w) => name.toLowerCase().includes(w));

export function priorityLevel(name: string): PriorityLevel {
  if (has(name, ["highest", "blocker", "critical", "urgent", "крит", "блок", "срочн", "наивысш"])) return "top";
  if (has(name, ["high", "major", "высок", "важн"])) return "high";
  if (has(name, ["low", "minor", "trivial", "низк", "незнач", "тривиал"])) return "low";
  return "mid";
}
