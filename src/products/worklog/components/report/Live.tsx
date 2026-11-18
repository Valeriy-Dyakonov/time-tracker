import { useEffect, useRef } from "react";
import type { DayProgress, LogEntry } from "@/shared/types";
import { count, dateShort, useT, weekdayShort } from "@/i18n";
import { isoWeekday } from "@/shared/lib/dates";
import { fmtH } from "../../lib/report/report";
import { Card } from "@/shared/ui";

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
export const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const ICON = { info: "·", ok: "✓", warn: "⚠", error: "✗" } as const;

export function logText(entries: LogEntry[]): string {
  return entries.map((e) => `${clock(e.t)} ${ICON[e.level]} ${e.msg}`).join("\n");
}

export function LogList(props: { entries: LogEntry[]; follow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [props.entries.length, props.follow]);
  return (
    <div className="loglist" ref={ref}>
      {props.entries.map((e, i) => (
        <div key={i} className={`logline ${e.level}`}>
          <span className="t">{clock(e.t)}</span>
          <span className="ic">{ICON[e.level]}</span>
          <span className="m">{e.msg}</span>
        </div>
      ))}
    </div>
  );
}

const STATUS_ICON: Record<DayProgress["status"], string> = { queued: "○", running: "◌", done: "✓", fallback: "⚠", nodata: "–" };

/** Live view of a running analysis: per-day status that fills in as days complete, plus the log. */
export function LivePanel(props: { days: DayProgress[]; log: LogEntry[]; running: boolean }) {
  const all = useT();
  const t = all.shell.live;
  const work = props.days.filter((d) => d.status !== "nodata");
  const finished = work.filter((d) => d.status !== "queued" && d.status !== "running").length;
  const empty = props.days.length - work.length;
  const pct = work.length ? (finished / work.length) * 100 : props.days.length ? 100 : 0;
  return (
    <Card className="live">
      <div className="live-head">
        <h3>{props.running ? t.running : t.stopped}</h3>
        <span className="muted">{t.progress(finished, work.length)}{empty > 0 ? t.withoutEvents(empty) : ""}</span>
      </div>
      <div className="meter big"><i style={{ width: `${pct}%` }} /></div>
      {props.days.length > 0 && (
        <div className="daygrid">
          {props.days.map((d) => (
            <div key={d.date} className={`daycell ${d.status}`}>
              <span className="ic">{STATUS_ICON[d.status]}</span>
              <span className="dt"><b>{weekdayShort(isoWeekday(d.date))}</b> {dateShort(d.date)}</span>
              <span className="st">
                {d.tasks && d.tasks.length > 0
                  ? d.tasks.slice(0, 3).map((x) => t.taskHours(x.key, fmtH(x.hours))).join(" · ")
                  : d.note ?? t.status[d.status]}
              </span>
              {d.status !== "nodata" && <span className="ev">{count(d.events, all.common.event)}</span>}
            </div>
          ))}
        </div>
      )}
      <h4>{t.log}</h4>
      <LogList entries={props.log} follow={props.running} />
    </Card>
  );
}
