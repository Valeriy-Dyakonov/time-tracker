import { count, dateShort, useT, weekdayShort } from "@/i18n";
import { isoWeekday } from "@/shared/lib/dates";
import { fmtH } from "../../../lib/report/report";
import type { DayMatch } from "../../../lib/submit/sync";
import type { JiraWorklog } from "@/shared/types";
import IssueLink from "@/shared/components/IssueLink";
import { InfoTip, keyColor } from "@/shared/ui";

const h = (minutes: number) => fmtH(minutes / 60);
const tone = (d: DayMatch) => (d.logged === d.planned ? "ok" : d.logged < d.planned ? "under" : "over");

/** Period totals: everything the user logged in Jira for the period against the plan, and on which days they differ. */
export function PeriodMatch({ days, mismatched }: { days: Map<string, DayMatch>; mismatched: string[] }) {
  const m = useT().submit.jira;
  let logged = 0, planned = 0;
  for (const d of days.values()) { logged += d.logged; planned += d.planned; }
  return (
    <span className="progress" title={m.summaryTitle}>
      <span>{m.periodTotals(h(logged), h(planned))}</span>
      {mismatched.length === 0
        ? <span className="jm ok">{m.match}</span>
        : <span className="jm over" title={mismatched.map((d) => dateShort(d)).join(", ")}>{m.mismatch(count(mismatched.length, m.days))}</span>}
    </span>
  );
}

/** Day header: Tempo total of the day against the plan. */
export function DayMatchChip({ d }: { d?: DayMatch }) {
  const m = useT().submit.jira;
  if (!d) return null;
  const k = tone(d);
  const diff = h(Math.abs(d.logged - d.planned));
  return (
    <span className={`jm ${k}`} title={k === "ok" ? m.match : k === "under" ? m.dayUnder(diff) : m.dayOver(diff)}>
      {m.dayTotals(h(d.logged), h(d.planned))}
    </span>
  );
}

/** Worklogs in Jira that the plan has no row for: the usual reason the totals differ. Shown, never changed. */
export function Unplanned({ list }: { list: JiraWorklog[] }) {
  const m = useT().submit.jira;
  if (list.length === 0) return null;
  const total = list.reduce((s, w) => s + Math.round(w.seconds / 60), 0);
  return (
    <details className="unplanned">
      <summary>
        {m.unplannedTitle(count(list.length, m.rows), h(total))}
        <InfoTip>{m.unplannedTip}</InfoTip>
      </summary>
      <div className="bulk-list">
        {list.map((w) => (
          <div key={w.id} className="bulk-row">
            <span />
            <span className="nw">{weekdayShort(isoWeekday(w.date))} {dateShort(w.date)}</span>
            <span className="nw"><span className="dot" style={{ background: keyColor(w.key) }} /> <IssueLink k={w.key} /></span>
            <b className="nw">{h(Math.round(w.seconds / 60))}</b>
            <span className="bulk-desc">{w.comment || m.noComment}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
