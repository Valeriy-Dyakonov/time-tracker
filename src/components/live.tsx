import { useEffect, useRef } from "react";
import type { DayProgress, LogEntry } from "../types";
import { formatRu, plural, weekdayName } from "../lib/dates";
import { fmtH } from "../lib/report";

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

const STATUS: Record<DayProgress["status"], { icon: string; label: string }> = {
  queued: { icon: "○", label: "в очереди" },
  running: { icon: "◌", label: "анализирую…" },
  done: { icon: "✓", label: "готово" },
  fallback: { icon: "⚠", label: "эвристика" },
  nodata: { icon: "–", label: "нет событий" },
};

/** Live view of a running analysis: per-day status that fills in as days complete, plus the log. */
export function LivePanel(props: { days: DayProgress[]; log: LogEntry[]; running: boolean }) {
  const work = props.days.filter((d) => d.status !== "nodata");
  const finished = work.filter((d) => d.status !== "queued" && d.status !== "running").length;
  const empty = props.days.length - work.length;
  const pct = work.length ? (finished / work.length) * 100 : props.days.length ? 100 : 0;
  return (
    <section className="card live">
      <div className="live-head">
        <h3>{props.running ? "Идёт анализ…" : "Анализ остановлен"}</h3>
        <span className="muted">Проанализировано дней с событиями: {finished} из {work.length}{empty > 0 ? ` · без событий: ${empty}` : ""}</span>
      </div>
      <div className="meter big"><i style={{ width: `${pct}%` }} /></div>
      {props.days.length > 0 && (
        <div className="daygrid">
          {props.days.map((d) => (
            <div key={d.date} className={`daycell ${d.status}`}>
              <span className="ic">{STATUS[d.status].icon}</span>
              <span className="dt"><b>{weekdayName(d.date)}</b> {formatRu(d.date).slice(0, 5)}</span>
              <span className="st">
                {d.tasks && d.tasks.length > 0
                  ? d.tasks.slice(0, 3).map((t) => `${t.key} ${fmtH(t.hours)}ч`).join(" · ")
                  : d.note ?? STATUS[d.status].label}
              </span>
              {d.status !== "nodata" && <span className="ev">{d.events} {plural(d.events, "событие", "события", "событий")}</span>}
            </div>
          ))}
        </div>
      )}
      <h4>Журнал</h4>
      <LogList entries={props.log} follow={props.running} />
    </section>
  );
}
