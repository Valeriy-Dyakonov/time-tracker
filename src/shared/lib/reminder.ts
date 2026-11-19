/** Minutes after midnight of "HH:MM"; null for anything else. */
export function parseTime(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** An app opened long after the hour does not nag about a reminder that belongs to the afternoon. */
export const GRACE_MINUTES = 180;

/** Time to remind: the hour has come, not long ago, and today's reminder has not been shown yet. */
export function isDue(now: Date, time: string, lastShownDay: string | null, today: string): boolean {
  const at = parseTime(time);
  if (at === null || lastShownDay === today) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= at && minutes < at + GRACE_MINUTES;
}

/** Enough is logged when the day's norm is covered (a few minutes short is rounding, not a missing day). */
export function isLogged(loggedSeconds: number, normHours: number): boolean {
  return loggedSeconds >= Math.max(0, normHours * 3600 - 300);
}
