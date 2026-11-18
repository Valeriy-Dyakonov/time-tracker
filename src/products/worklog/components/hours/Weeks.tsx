import { useMemo } from "react";
import type { Analysis, DayPlan } from "@/shared/types";
import { dayTotal } from "../../lib/plan/distribute";
import { dateShort, useT } from "@/i18n";
import { formatDate } from "@/shared/lib/dates";
import { fmtH, fmtMinutes, meetingMinutes, weeksOf, type Week } from "../../lib/report/report";
import { CopyButton } from "@/shared/ui";
import { Day } from "./Day";
import { needsReview, percent } from "./review";

export function Weeks(props: {
  a: Analysis;
  updateDay: (date: string, fn: (d: DayPlan) => DayPlan) => void;
  onlyReview: boolean;
  open: Set<string>;
  toggle: (date: string) => void;
}) {
  const { a, updateDay, onlyReview } = props;
  const weeks = useMemo(() => weeksOf(a.days), [a]);
  return (
    <div>
      {weeks.map((w) => {
        const days = onlyReview ? w.days.filter(needsReview) : w.days;
        if (days.length === 0) return null;
        return (
          <section className="week" key={w.monday}>
            <WeekHeader w={w} />
            <div className="daylist">
              {days.map((d) => (
                <Day key={d.date} a={a} d={d} open={props.open.has(d.date)} onToggle={() => props.toggle(d.date)} update={(fn) => updateDay(d.date, fn)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function WeekHeader({ w }: { w: Week }) {
  const all = useT();
  const t = all.hours.week;
  const work = w.days.filter((d) => !d.off);
  const mm = work.reduce((s, d) => s + meetingMinutes(d), 0);
  const target = work.reduce((s, d) => s + d.target, 0);
  const done = Math.abs(w.total - target) < 0.01;
  return (
    <header className="week-h">
      <h3>{dateShort(w.monday)} – {dateShort(w.sunday)}</h3>
      <span className="wk-meter"><i className={done ? "good" : "bad"} style={{ width: `${Math.min(100, percent(w.total, target))}%` }} /></span>
      <span className={`wk-total ${done ? "ok" : "bad"}`}>{fmtH(w.total)}<small> / {fmtH(target)} {all.common.h}</small></span>
      {mm > 0 && <span className="muted">{t.meetings(fmtMinutes(mm))}</span>}
      <span className="spacer" />
      <CopyButton
        label={t.copy}
        title={t.copyHint}
        text={() => w.days.map((d) => `${formatDate(d.date)}\t${fmtH(dayTotal(d))}`).join("\n")}
      />
    </header>
  );
}
