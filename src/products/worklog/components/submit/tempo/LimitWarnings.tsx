import { dateShort, useT, weekdayShort } from "@/i18n";
import { isoWeekday } from "@/shared/lib/dates";
import type { LimitReport } from "../../../lib/submit/limits";
import { fmtH } from "../../../lib/report/report";

const h = (minutes: number) => fmtH(minutes / 60);
const day = (date: string) => `${weekdayShort(isoWeekday(date))} ${dateShort(date)}`;

/** Days over their norm, hours on days off, dates outside the period, and a period total above the norm. */
export function LimitWarnings({ r }: { r: LimitReport }) {
  const m = useT().submit.limits;
  if (r.ok) return null;
  return (
    <div className="limits">
      <b>{m.title}</b>
      <ul>
        {r.total > r.limit && <li>{m.overTotal(h(r.total), h(r.limit))}</li>}
        {r.overDays.map((d) => <li key={d.date}>{d.off ? m.offDay(day(d.date), h(d.minutes)) : m.overDay(day(d.date), h(d.minutes), h(d.limit))}</li>)}
        {r.outside.map((d) => <li key={d}>{m.outside(dateShort(d))}</li>)}
      </ul>
    </div>
  );
}

/** One-line reason for a single write, used to ask before logging a row. */
export function limitText(r: LimitReport, m: ReturnType<typeof useT>["submit"]["limits"]): string | undefined {
  if (r.ok) return undefined;
  const parts = [
    ...(r.total > r.limit ? [m.overTotal(h(r.total), h(r.limit))] : []),
    ...r.overDays.map((d) => (d.off ? m.offDay(day(d.date), h(d.minutes)) : m.overDay(day(d.date), h(d.minutes), h(d.limit)))),
    ...r.outside.map((d) => m.outside(dateShort(d))),
  ];
  return `${m.title} ${parts.join("; ")}`;
}
