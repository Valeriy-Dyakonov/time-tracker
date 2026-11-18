import { useMemo } from "react";
import type { Analysis } from "@/shared/types";
import { dateShort, plural, useT, weekdayShort } from "@/i18n";
import { formatDate, isoWeekday } from "@/shared/lib/dates";
import { fmtH, totalsByTask } from "../../lib/report/report";
import IssueLink from "@/shared/components/IssueLink";
import { CopyButton, keyColor } from "@/shared/ui";
import { percent } from "./review";

interface TaskDay { date: string; hours: number; note?: string }

function daysPerTask(a: Analysis): Map<string, TaskDay[]> {
  const m = new Map<string, TaskDay[]>();
  for (const d of a.days) {
    if (d.off) continue;
    for (const t of d.tasks) if (t.hours > 0) m.set(t.key, [...(m.get(t.key) ?? []), { date: d.date, hours: t.hours, note: t.notes[0] }]);
  }
  return m;
}

export function ByTask({ a }: { a: Analysis }) {
  const all = useT();
  const t = all.hours.byTask;
  const rows = totalsByTask(a);
  const total = rows.reduce((s, r) => s + r.hours, 0) || 1;
  const perTask = useMemo(() => daysPerTask(a), [a]);
  return (
    <div className="tasklist">
      {rows.map((r) => {
        const days = perTask.get(r.key) ?? [];
        return (
          <section className="tl-row" key={r.key}>
            <div className="tl-head">
              <i className="dot" style={{ background: keyColor(r.key) }} />
              <IssueLink k={r.key} />
              <span className="tl-title" title={r.summary}>{r.summary}</span>
              <span className="tl-share" title={t.shareHint}><i style={{ width: `${percent(r.hours, total)}%`, background: keyColor(r.key) }} /></span>
              <span className="tl-days">{days.length}&nbsp;{plural(days.length, all.common.day)}</span>
              <span className="tl-total">{fmtH(r.hours)}&nbsp;<small>{all.common.h}</small></span>
              <CopyButton label={all.common.copy} title={t.copyHint} text={() => days.map((x) => `${formatDate(x.date)}\t${fmtH(x.hours)}`).join("\n")} />
            </div>
            <div className="tl-chips">
              {days.map((x) => (
                <span key={x.date} className="daychip" title={x.note ?? ""}>
                  <i>{weekdayShort(isoWeekday(x.date))}&nbsp;{dateShort(x.date)}</i><b>{fmtH(x.hours)}</b>
                </span>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
