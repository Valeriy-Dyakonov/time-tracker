import { useMemo } from "react";
import type { Analysis, DayPlan } from "../../types";
import { dayTotal } from "../../lib/allocate";
import { formatRu } from "../../lib/dates";
import { fmtH, fmtMinutes, meetingMinutes, weeksOf, type Week } from "../../lib/report";
import { CopyButton } from "../ui";
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
  const work = w.days.filter((d) => !d.off);
  const mm = work.reduce((s, d) => s + meetingMinutes(d), 0);
  const target = work.reduce((s, d) => s + d.target, 0);
  const done = Math.abs(w.total - target) < 0.01;
  return (
    <header className="week-h">
      <h3>{formatRu(w.monday).slice(0, 5)} – {formatRu(w.sunday).slice(0, 5)}</h3>
      <span className="wk-meter"><i className={done ? "good" : "bad"} style={{ width: `${Math.min(100, percent(w.total, target))}%` }} /></span>
      <span className={`wk-total ${done ? "ok" : "bad"}`}>{fmtH(w.total)}<small> / {fmtH(target)} ч</small></span>
      {mm > 0 && <span className="muted">встречи {fmtMinutes(mm)}</span>}
      <span className="spacer" />
      <CopyButton
        label="Копировать итоги"
        title="Даты и часы каждого дня недели, по строке на день — для системы учёта, где часы вводятся по дням"
        text={() => w.days.map((d) => `${formatRu(d.date)}\t${fmtH(dayTotal(d))}`).join("\n")}
      />
    </header>
  );
}
