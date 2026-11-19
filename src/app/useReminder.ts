import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import { api } from "@/shared/api";
import { localDate } from "@/shared/lib/dates";
import { isDue, isLogged } from "@/shared/lib/reminder";
import type { Settings } from "@/shared/types";
import { loadWorkCalendar } from "@/products/worklog/lib/analysis/workCalendar";

const KEY = "worklog.reminder.day";
const CHECK_EVERY_MS = 30_000;

const lastDay = (): string | null => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
const markDay = (day: string) => {
  try { localStorage.setItem(KEY, day); } catch { /* storage unavailable: it may remind again after a restart */ }
};

/**
 * Today is worth a reminder when it is a working day and the day's norm is not logged yet. Whether the time is
 * already logged is read from Jira; when that cannot be read, the reminder is shown anyway.
 */
async function needed(settings: Settings, today: string, jira: boolean): Promise<boolean> {
  const cal = await loadWorkCalendar(settings, today, today, settings.hoursPerDay, () => {});
  if (!cal.dates.includes(today)) return false;
  if (!jira) return true;
  try {
    const logged = (await api.jiraWorklogs(today, today)).reduce((n, w) => n + w.seconds, 0);
    return !isLogged(logged, cal.targets[today] ?? settings.hoursPerDay);
  } catch {
    return true;
  }
}

/** Shows the evening reminder to log the time. Works while the app is open. */
export function useReminder(settings: Settings, jira: boolean, active: boolean): void {
  // The timer reads the latest values without restarting.
  const latest = useRef({ settings, jira });
  latest.current = { settings, jira };
  const busy = useRef(false);

  useEffect(() => {
    if (!active || !settings.remindEnabled) return;
    const tick = async () => {
      const now = new Date();
      const today = localDate(now);
      const s = latest.current.settings;
      if (busy.current || !isDue(now, s.remindTime, lastDay(), today)) return;
      busy.current = true;
      try {
        // Decided once for the day, whether or not a notification follows.
        markDay(today);
        if (await needed(s, today, latest.current.jira)) {
          const m = t().settings.reminder;
          await api.notify(m.title, m.body);
        }
      } catch { /* the notification could not be shown: nothing to do */ } finally {
        busy.current = false;
      }
    };
    void tick();
    const id = setInterval(() => void tick(), CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [active, settings.remindEnabled, settings.remindTime]);
}
