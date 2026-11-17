import { useMemo, useState } from "react";
import type { Analysis, DayPlan, Source } from "../types";
import { dayTotal, rebalance, statusOnDate, STEP } from "../lib/allocate";
import { formatRu, monthShort, plural, weekdayName } from "../lib/dates";
import {
  fmtH, fmtMinutes, grandTotal, meetingMinutes, meetingRange, targetTotal, totalsByTask, weeksOf,
} from "../lib/report";
import IssueLink from "./IssueLink";
import { CopyButton, keyColor } from "./ui";

const SRC: Record<Source, string> = { jira: "Jira", git: "Git", gitlab: "GitLab", matrix: "Matrix", confluence: "Confluence", calendar: "Календарь" };
const EPS = 0.001;

const needsReview = (d: DayPlan) => !d.off && (d.basis !== "activity" || Math.abs(dayTotal(d) - d.target) > EPS);

/** Why a day is in the "check me" list, in plain words. */
function reviewReason(d: DayPlan): string {
  if (d.basis === "empty") return "Нет событий — день не заполнен";
  if (d.basis === "inferred")
    return d.inferredFrom ? `Нет событий — часы взяты со дня ${formatRu(d.inferredFrom).slice(0, 5)}` : "Нет событий — часы распределены по периоду";
  return `Сумма ${fmtH(dayTotal(d))} ч, а норма ${fmtH(d.target)} ч`;
}

function sourceCounts(d: DayPlan): [Source, number][] {
  const m = new Map<Source, number>();
  for (const e of d.evidence) m.set(e.source, (m.get(e.source) ?? 0) + 1);
  return [...m.entries()].sort((x, y) => y[1] - x[1]);
}

/** One-glance answer to "is the month done, and what needs my attention". */
export function Verdict({ a, onReview }: { a: Analysis; onReview: () => void }) {
  const total = grandTotal(a);
  const target = targetTotal(a);
  const diff = total - target;
  const ok = Math.abs(diff) < 0.01;
  const work = a.days.filter((d) => !d.off);
  const review = a.days.filter(needsReview);
  const totalsSrc = useMemo(() => {
    const m = new Map<Source, number>();
    for (const d of work) for (const [s, n] of sourceCounts(d)) m.set(s, (m.get(s) ?? 0) + n);
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [a]);

  return (
    <section className="verdict">
      <div className={`vd ${ok ? "good" : "bad"}`}>
        <div className="vd-big">{ok ? "Часы сходятся с нормой" : diff > 0 ? `Лишних ${fmtH(diff)} ч` : `Не хватает ${fmtH(-diff)} ч`}</div>
        <div className="vd-sub">
          Распределено <b>{fmtH(total)} ч</b> из нормы <b>{fmtH(target)} ч</b> — {work.length} {plural(work.length, "рабочий день", "рабочих дня", "рабочих дней")} по {fmtH(a.hoursPerDay)} ч.
        </div>
      </div>
      <div className={`vd ${review.length ? "warn" : "good"}`}>
        <div className="vd-big">{review.length ? `Проверьте ${review.length} ${plural(review.length, "день", "дня", "дней")}` : "Все дни по данным"}</div>
        <div className="vd-sub">
          {review.length ? (
            <>По ним нет событий или сумма не равна норме. <button className="linkbtn" onClick={onReview}>Показать только их</button></>
          ) : (
            "Каждый день построен по реальным событиям: коммитам, задачам, чату и календарю."
          )}
        </div>
      </div>
      <div className="vd">
        <div className="vd-big">{a.usedAi ? "Анализ ИИ" : "Без ИИ"}</div>
        <div className="vd-sub">
          {a.usedAi ? "ИИ определил, над какими задачами вы работали, и разделил время." : "Доли посчитаны эвристикой по ключам задач в коммитах и Jira."}
          {totalsSrc.length > 0 && (
            <span className="srcs">{totalsSrc.map(([s, n]) => <span key={s} className={`src s-${s}`}>{SRC[s]} {n}</span>)}</span>
          )}
        </div>
      </div>
    </section>
  );
}

type Mode = "days" | "tasks";

export function Timesheet(props: {
  a: Analysis;
  updateDay: (date: string, fn: (d: DayPlan) => DayPlan) => void;
  onlyReview: boolean;
  setOnlyReview: (v: boolean) => void;
  onAi: () => void;
}) {
  const { a, updateDay, onlyReview, setOnlyReview } = props;
  const [mode, setMode] = useState<Mode>("days");
  const review = a.days.filter(needsReview);

  function jump(date: string) {
    setMode("days");
    setTimeout(() => {
      const el = document.getElementById(`day-${date}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1600);
    }, 30);
  }

  return (
    <div className="ts-layout">
      <div className="ts-main">
        <div className="ts-bar">
          <div className="seg" role="tablist">
            <button className={mode === "days" ? "on" : ""} onClick={() => setMode("days")}>По дням</button>
            <button className={mode === "tasks" ? "on" : ""} onClick={() => setMode("tasks")}>По задачам</button>
          </div>
          <span className="muted">
            {mode === "days"
              ? "Каждая строка — один рабочий день. Часы можно править, итог дня пересчитается."
              : "Для Jira: по каждой задаче — в какие дни и сколько часов списать."}
          </span>
          <span className="spacer" />
          {mode === "days" && (
            <>
              <span className="legend">
                <span><i className="lg good" />по данным</span>
                <span><i className="lg warn" />без данных</span>
                <span><i className="lg bad" />не заполнен</span>
              </span>
              <label className="check">
                <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
                Только требующие проверки ({review.length})
              </label>
            </>
          )}
        </div>
        {mode === "days" ? <Weeks a={a} updateDay={updateDay} onlyReview={onlyReview} /> : <ByTask a={a} />}
      </div>

      <aside className="ts-rail">
        <section className="card rail-card">
          <div className="rail-h"><h4>О чём период</h4><button className="linkbtn" onClick={props.onAi}>Подробный разбор →</button></div>
          <p className="rail-text">{a.narrative}</p>
        </section>

        <section className="card rail-card">
          <div className="rail-h"><h4>Что проверить</h4><span className="muted">{review.length}</span></div>
          {review.length === 0 ? (
            <p className="muted">Всё построено по реальным событиям, суммы дней равны норме.</p>
          ) : (
            <ul className="rail-review">
              {review.map((d) => (
                <li key={d.date}>
                  <button onClick={() => jump(d.date)}>
                    <i className={`lg ${d.basis === "empty" ? "bad" : d.basis === "inferred" ? "warn" : "bad"}`} />
                    <b>{weekdayName(d.date)} {formatRu(d.date).slice(0, 5)}</b>
                    <span>{reviewReason(d)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card rail-card">
          <div className="rail-h"><h4>Куда ушло время</h4><span className="muted">за период</span></div>
          <RailTasks a={a} />
        </section>
      </aside>
    </div>
  );
}

function RailTasks({ a }: { a: Analysis }) {
  const rows = totalsByTask(a);
  const total = rows.reduce((s, r) => s + r.hours, 0) || 1;
  return (
    <ul className="rail-tasks">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="rt-top">
            <span className="dot" style={{ background: keyColor(r.key) }} />
            <IssueLink k={r.key} />
            <span className="spacer" />
            <b>{fmtH(r.hours)} ч</b>
            <span className="muted">{Math.round((r.hours / total) * 100)}%</span>
          </div>
          <div className="rt-title" title={r.summary}>{r.summary}</div>
          <div className="meter"><i style={{ width: `${(r.hours / total) * 100}%`, background: keyColor(r.key) }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Weeks({ a, updateDay, onlyReview }: { a: Analysis; updateDay: (date: string, fn: (d: DayPlan) => DayPlan) => void; onlyReview: boolean }) {
  const weeks = useMemo(() => weeksOf(a.days), [a]);
  return (
    <div>
      {weeks.map((w) => {
        const days = onlyReview ? w.days.filter(needsReview) : w.days;
        if (days.length === 0) return null;
        const mm = w.days.reduce((s, d) => s + (d.off ? 0 : meetingMinutes(d)), 0);
        const target = w.days.reduce((s, d) => s + (d.off ? 0 : d.target), 0);
        const done = Math.abs(w.total - target) < 0.01;
        return (
          <section className="week" key={w.monday}>
            <header className="week-h">
              <h3>Неделя {formatRu(w.monday).slice(0, 5)} – {formatRu(w.sunday).slice(0, 5)}</h3>
              <span className={`wk-total ${done ? "ok" : "bad"}`}>{fmtH(w.total)} <small>из {fmtH(target)} ч</small></span>
              <span className="wk-meter"><i style={{ width: `${Math.min(100, target ? (w.total / target) * 100 : 0)}%` }} /></span>
              {mm > 0 && <span className="muted">📞 {fmtMinutes(mm)} звонков и встреч</span>}
              <span className="spacer" />
              <CopyButton label="Копировать итоги дней" text={() => w.days.map((d) => `${formatRu(d.date)}\t${fmtH(dayTotal(d))}`).join("\n")} />
            </header>
            <div className="cols">
              <span>День</span>
              <span>Задачи и часы <em>— для Jira</em></span>
              <span>Что делали и почему так</span>
              <span>Звонки и встречи</span>
              <span className="r">Итого <em>— для системы по дням</em></span>
            </div>
            {days.map((d) => <Day key={d.date} a={a} d={d} update={(fn) => updateDay(d.date, fn)} />)}
          </section>
        );
      })}
    </div>
  );
}

function Day({ a, d, update }: { a: Analysis; d: DayPlan; update: (fn: (d: DayPlan) => DayPlan) => void }) {
  const total = dayTotal(d);
  const balanced = d.off || Math.abs(total - d.target) < EPS;
  const setHoursFor = (key: string, v: number) =>
    update((x) => ({ ...x, tasks: x.tasks.map((t) => (t.key === key ? { ...t, hours: Math.max(0, v) } : t)) }));
  const srcs = sourceCounts(d);

  return (
    <div id={`day-${d.date}`} className={`dayrow b-${d.off ? "off" : d.basis}`}>
      <div className="c-date">
        <span className="dow">{weekdayName(d.date)}</span>
        <span className="num">{Number(d.date.slice(8))}</span>
        <span className="mon">{monthShort(d.date)}</span>
      </div>

      {d.off ? (
        <div className="c-off">Выходной или отпуск — часы не списываются.</div>
      ) : (
        <>
          <div className="c-tasks">
            {d.tasks.map((t) => (
              <div className="t-row" key={t.key}>
                <span className="dot" style={{ background: keyColor(t.key) }} />
                <span className="t-key"><IssueLink k={t.key} /></span>
                <span className="t-hours">
                  <input type="number" min={0} step={STEP} value={t.hours} onChange={(e) => setHoursFor(t.key, Number(e.target.value))} />
                  <span className="muted">ч</span>
                </span>
                <span className="t-body">
                  <span className="t-title" title={a.issues[t.key]?.summary}>
                    {a.issues[t.key]?.summary}
                    {statusOnDate(a.issues[t.key], d.date) && <span className="t-status" title="Статус задачи в этот день по истории Jira">{statusOnDate(a.issues[t.key], d.date)}</span>}
                  </span>
                  {t.notes[0] && <span className="t-note">{t.notes[0]}</span>}
                </span>
              </div>
            ))}
            {d.tasks.length === 0 && <div className="muted">Задач нет — день пока не заполнен.</div>}
          </div>

          <div className="c-why">
            {d.basis === "activity" ? (
              <>
                {d.summary && <p className="why-main">{d.summary}</p>}
                {srcs.length > 0 && (
                  <div className="srcs" title="Из чего собран день">
                    {srcs.map(([s, n]) => <span key={s} className={`src s-${s}`}>{SRC[s]} {n}</span>)}
                  </div>
                )}
                {d.reasoning && (
                  <details className="why-more"><summary>Почему такие доли</summary><p>{d.reasoning}</p></details>
                )}
              </>
            ) : (
              <p className={`why-main ${d.basis === "empty" ? "bad" : "warn"}`}>{d.reasoning || reviewReason(d)}</p>
            )}
          </div>

          <div className="c-meet">
            {d.meetings.length === 0 ? <span className="muted">—</span> : (
              <>
                <div className="mt-sum">{fmtMinutes(meetingMinutes(d))}</div>
                <ul>
                  {d.meetings.slice(0, 5).map((m, i) => (
                    <li key={i} className={m.isCall ? "call" : ""} title={`${m.title}\n${meetingRange(m)}${m.organizer ? "\nОрганизатор: " + m.organizer : ""}`}>
                      <b>{meetingRange(m)}</b> {m.title}
                    </li>
                  ))}
                  {d.meetings.length > 5 && <li className="muted">ещё {d.meetings.length - 5}</li>}
                </ul>
              </>
            )}
          </div>
        </>
      )}

      <div className="c-total">
        <div className={`d-total ${balanced ? "ok" : "bad"}`}>{fmtH(total)}<small> ч</small></div>
        {!d.off && !balanced && <div className="d-norm bad">норма {fmtH(d.target)} ч</div>}
        {!d.off && d.basis === "inferred" && <span className="badge warn">без данных</span>}
        {!d.off && d.basis === "empty" && <span className="badge bad">не заполнен</span>}
        <div className="d-actions">
          {!balanced && <button className="btn small" onClick={() => update(rebalance)}>Выровнять до нормы</button>}
          <button className="btn small ghost" onClick={() => update((x) => ({ ...x, off: !x.off }))}>{d.off ? "Вернуть день" : "Выходной"}</button>
          {!d.off && <CopyButton text={() => dayTextShort(a, d)} />}
        </div>
      </div>
    </div>
  );
}

const dayTextShort = (a: Analysis, d: DayPlan) =>
  `${formatRu(d.date)}\n` + d.tasks.map((t) => `${t.key} ${a.issues[t.key]?.summary ?? ""}: ${fmtH(t.hours)} ч`).join("\n") + `\nИтого: ${fmtH(dayTotal(d))} ч`;

function ByTask({ a }: { a: Analysis }) {
  const rows = totalsByTask(a);
  const perTask = useMemo(() => {
    const m = new Map<string, { date: string; hours: number; note?: string }[]>();
    for (const d of a.days) {
      if (d.off) continue;
      for (const t of d.tasks) if (t.hours > 0) m.set(t.key, [...(m.get(t.key) ?? []), { date: d.date, hours: t.hours, note: t.notes[0] }]);
    }
    return m;
  }, [a]);
  return (
    <div className="taskgrid">
      {rows.map((r) => {
        const days = perTask.get(r.key) ?? [];
        return (
          <section className="card taskcard" key={r.key}>
            <header>
              <span className="dot" style={{ background: keyColor(r.key) }} />
              <b><IssueLink k={r.key} /></b>
              <span className="tc-title" title={r.summary}>{r.summary}</span>
              <span className="spacer" />
              <span className="tc-total">{fmtH(r.hours)}<small> ч</small></span>
            </header>
            <div className="tc-days">
              {days.map((x) => (
                <span key={x.date} className="daychip" title={x.note ?? ""}>
                  <i>{weekdayName(x.date)} {formatRu(x.date).slice(0, 5)}</i><b>{fmtH(x.hours)}</b>
                </span>
              ))}
            </div>
            <footer>
              <span className="muted">{days.length} {plural(days.length, "день", "дня", "дней")}</span>
              <CopyButton label="Копировать даты и часы" text={() => days.map((x) => `${formatRu(x.date)}\t${fmtH(x.hours)}`).join("\n")} />
            </footer>
          </section>
        );
      })}
    </div>
  );
}
