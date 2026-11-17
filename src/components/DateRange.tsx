import { useEffect, useRef, useState } from "react";
import { addDays, isoWeekday, localDate, parseDate, WEEKDAYS_SHORT } from "../lib/dates";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const label = (s: string, withYear: boolean) => {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
};

/** Days of a month grid, Monday first, padded with neighbouring months' days. */
function monthGrid(year: number, month: number): string[] {
  const first = localDate(new Date(year, month, 1, 12));
  const start = addDays(first, -(isoWeekday(first) - 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/**
 * Period picker in the app's own style (the native date popup ignores the theme).
 * First click picks the start, second the end; Esc or a click outside closes it.
 */
export default function DateRange(props: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => { const d = parseDate(props.start); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [pick, setPick] = useState<string | null>(null); // start chosen, waiting for the end
  const [hover, setHover] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function close() { setOpen(false); setPick(null); setHover(null); }
  function toggle() {
    if (open) return close();
    const d = parseDate(props.start);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setOpen(true);
  }
  function shift(n: number) {
    setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  }
  function choose(day: string) {
    if (!pick) { setPick(day); return; }
    const [a, b] = day < pick ? [day, pick] : [pick, day];
    props.onChange(a, b);
    close();
  }

  // Range shown while choosing: from the picked start to the hovered day.
  const [lo, hi] = pick ? (hover && hover < pick ? [hover, pick] : [pick, hover ?? pick]) : [props.start, props.end];
  const today = localDate(new Date());
  const sameYear = props.start.slice(0, 4) === props.end.slice(0, 4);
  const months = [view, (() => { const d = new Date(view.y, view.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })()];

  return (
    <div className="dr" ref={ref}>
      <button type="button" className={`dr-btn ${open ? "on" : ""}`} onClick={toggle} aria-expanded={open}>
        <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
        <span>{label(props.start, !sameYear)} — {label(props.end, true)}</span>
      </button>
      {open && (
        <div className="dr-pop" role="dialog" aria-label="Выбор периода">
          <div className="dr-head">
            <button type="button" className="dr-nav" onClick={() => shift(-1)} aria-label="Предыдущий месяц">‹</button>
            <span className="dr-hint">{pick ? "Выберите конец периода" : "Выберите начало периода"}</span>
            <button type="button" className="dr-nav" onClick={() => shift(1)} aria-label="Следующий месяц">›</button>
          </div>
          <div className="dr-months">
            {months.map(({ y, m }) => (
              <div className="dr-month" key={`${y}-${m}`}>
                <div className="dr-title">{MONTHS[m]} {y}</div>
                <div className="dr-grid">
                  {WEEKDAYS_SHORT.map((w, i) => <span key={w} className={`dr-wd ${i > 4 ? "we" : ""}`}>{w}</span>)}
                  {monthGrid(y, m).map((d) => {
                    const out = parseDate(d).getMonth() !== m;
                    if (out) return <span key={d} className="dr-day out" />;
                    const inRange = d >= lo && d <= hi;
                    const cls = [
                      "dr-day",
                      inRange ? "in" : "",
                      d === lo ? "lo" : "",
                      d === hi ? "hi" : "",
                      d === today ? "today" : "",
                      isoWeekday(d) > 5 ? "we" : "",
                    ].join(" ");
                    return (
                      <button type="button" key={d} className={cls} onClick={() => choose(d)} onMouseEnter={() => pick && setHover(d)}>
                        {Number(d.slice(8))}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
