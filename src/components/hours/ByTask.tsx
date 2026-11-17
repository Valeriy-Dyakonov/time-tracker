import { useMemo } from "react";
import type { Analysis } from "../../types";
import { formatRu, plural, weekdayName } from "../../lib/dates";
import { fmtH, totalsByTask } from "../../lib/report";
import IssueLink from "../IssueLink";
import { CopyButton, keyColor } from "../ui";
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
              <span className="tl-share" title="Доля задачи от всех часов периода"><i style={{ width: `${percent(r.hours, total)}%`, background: keyColor(r.key) }} /></span>
              <span className="tl-days">{days.length}&nbsp;{plural(days.length, "день", "дня", "дней")}</span>
              <span className="tl-total">{fmtH(r.hours)}&nbsp;<small>ч</small></span>
              <CopyButton label="Копировать" title="Даты и часы по этой задаче, по строке на день — удобно для списания в Jira" text={() => days.map((x) => `${formatRu(x.date)}\t${fmtH(x.hours)}`).join("\n")} />
            </div>
            <div className="tl-chips">
              {days.map((x) => (
                <span key={x.date} className="daychip" title={x.note ?? ""}>
                  <i>{weekdayName(x.date)}&nbsp;{formatRu(x.date).slice(0, 5)}</i><b>{fmtH(x.hours)}</b>
                </span>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
