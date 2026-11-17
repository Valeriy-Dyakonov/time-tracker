import { api } from "../../api";
import type { LogLevel, Settings } from "../../types";
import { isoWeekday, localDate } from "../dates";
import { workDates } from "../events/days";
import { fmtH } from "../report";
import { sd } from "./format";

export interface WorkCalendar {
  dates: string[];
  /** Norm per date where it differs from the default (shortened pre-holiday days). */
  targets: Record<string, number>;
  warning?: string;
}

/**
 * Working days of the period after the production calendar: holidays are not worked,
 * transferred Saturdays are, pre-holiday days are an hour shorter.
 */
export async function loadWorkCalendar(
  settings: Settings,
  start: string,
  end: string,
  hoursPerDay: number,
  log: (level: LogLevel, msg: string) => void,
): Promise<WorkCalendar> {
  const off = new Set<string>();
  const extra = new Set<string>();
  const targets: Record<string, number> = {};
  let warning: string | undefined;

  if (settings.holidayCountry) {
    try {
      const h = await api.fetchHolidays(settings.holidayCountry, start, end);
      for (const d of h.days) {
        const wd = isoWeekday(d.date);
        if (d.kind === "off") off.add(d.date);
        // A weekend marked as working (transferred Saturday) is worked, even if it is also a shortened day.
        if (d.kind !== "off" && wd >= 6 && !settings.workdays.includes(wd)) extra.add(d.date);
        if (d.kind === "short" && settings.shortDays) targets[d.date] = Math.max(0, hoursPerDay - 1);
      }
      const weekdayOff = [...off].filter((d) => settings.workdays.includes(isoWeekday(d)));
      const short = Object.keys(targets);
      log("info", `Производственный календарь (${settings.holidayCountry.toUpperCase()}, ${h.source}): праздничных и перенесённых выходных в будни ${weekdayOff.length}${weekdayOff.length ? " — " + weekdayOff.map(sd).join(", ") : ""}; сокращённых дней ${short.length}${short.length ? " — " + short.map(sd).join(", ") + ` (по ${fmtH(Math.max(0, hoursPerDay - 1))} ч)` : ""}; рабочих суббот ${extra.size}.`);
    } catch (e) {
      log("warn", `Производственный календарь не загружен (${e}) — праздники не учтены, считаю только по дням недели.`);
      warning = `Праздники не учтены: ${e}`;
    }
  }
  return { dates: workDates(start, end, settings.workdays, localDate(new Date()), { off, extra }), targets, warning };
}
