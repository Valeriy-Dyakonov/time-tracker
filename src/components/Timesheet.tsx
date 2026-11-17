import { useMemo, useState } from "react";
import type { Analysis, DayPlan, Source } from "../types";
import { dayTotal, rebalance, statusOnDate, STEP } from "../lib/allocate";
import { formatRu, monthShort, plural, weekdayName } from "../lib/dates";
import {
  fmtH, fmtMinutes, grandTotal, meetingMinutes, meetingRange, targetTotal, totalsByTask, weeksOf,
} from "../lib/report";
import IssueLink from "./IssueLink";
import { CopyButton, keyColor, Stepper } from "./ui";

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
  const mm = work.reduce((s, d) => s + meetingMinutes(d), 0);
  const totalsSrc = useMemo(() => {
    const m = new Map<Source, number>();
    for (const d of work) for (const [s, n] of sourceCounts(d)) m.set(s, (m.get(s) ?? 0) + n);
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [a]);

  return (
    <section className="stats">
      <div className="stat">
        <span className="st-label">Распределено</span>
        <span className="st-val">{fmtH(total)}<small> / {fmtH(target)} ч</small></span>
        <span className="st-bar"><i className={ok ? "good" : "bad"} style={{ width: `${Math.min(100, target ? (total / target) * 100 : 0)}%` }} /></span>
        <span className={`st-sub ${ok ? "good" : "bad"}`}>{ok ? "сходится с нормой" : diff > 0 ? `лишних ${fmtH(diff)} ч` : `не хватает ${fmtH(-diff)} ч`}</span>
      </div>
      <div className="stat">
        <span className="st-label">Рабочих дней</span>
        <span className="st-val">{work.length}<small> × {fmtH(a.hoursPerDay)} ч</small></span>
        <span className="st-sub">{formatRu(a.start).slice(0, 5)} – {formatRu(a.end).slice(0, 5)}</span>
      </div>
      <button className={`stat ${review.length ? "warn click" : ""}`} disabled={!review.length} onClick={onReview} title={review.length ? "Показать только эти дни" : ""}>
        <span className="st-label">Проверить</span>
        <span className={`st-val ${review.length ? "warn" : "good"}`}>{review.length || "✓"}<small>{review.length ? ` ${plural(review.length, "день", "дня", "дней")}` : " всё по данным"}</small></span>
        <span className="st-sub">{review.length ? "без событий или не равны норме →" : "каждый день — по реальным событиям"}</span>
      </button>
      <div className="stat">
        <span className="st-label">Встречи</span>
        <span className="st-val">{mm === 0 ? "—" : mm < 60 ? mm : Math.floor(mm / 60)}{mm > 0 && <small>{mm < 60 ? " мин" : ` ч${mm % 60 ? ` ${mm % 60} мин` : ""}`}</small>}</span>
        <span className="st-sub">входят в рабочие часы</span>
      </div>
      <div className="stat wide">
        <span className="st-label">{a.usedAi ? "Распределил ИИ" : "Эвристика без ИИ"}</span>
        <span className="st-srcs">{totalsSrc.map(([s, n]) => <span key={s} className={`src s-${s}`}><i />{SRC[s]} <b>{n}</b></span>)}</span>
        <span className="st-sub">событий из источников</span>
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
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const review = a.days.filter(needsReview);
  const toggle = (date: string) => setOpen((o) => { const n = new Set(o); if (n.has(date)) n.delete(date); else n.add(date); return n; });
  const allOpen = a.days.length > 0 && a.days.every((d) => open.has(d.date));

  function jump(date: string) {
    setMode("days");
    setOpen((o) => new Set(o).add(date));
    setTimeout(() => {
      const el = document.getElementById(`day-${date}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1600);
    }, 30);
  }

  return (
    <div className="ts-main">
      <Overview a={a} review={review} onJump={jump} onAi={props.onAi} />
      <div className="ts-bar">
        <div className="seg small" role="tablist">
          <button className={mode === "days" ? "on" : ""} onClick={() => setMode("days")}>По дням</button>
          <button className={mode === "tasks" ? "on" : ""} onClick={() => setMode("tasks")}>По задачам</button>
        </div>
        {mode === "days" && (
          <>
            <span className="legend">
              <span><i className="lg good" />по событиям</span>
              <span><i className="lg warn" />без событий</span>
              <span><i className="lg bad" />не заполнен</span>
            </span>
            <span className="spacer" />
            <label className="switch">
              <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
              <i />Только для проверки ({review.length})
            </label>
            <button className="btn small ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(a.days.map((d) => d.date)))}>
              {allOpen ? "Свернуть все" : "Развернуть все"}
            </button>
          </>
        )}
        {mode === "tasks" && <span className="muted">Для Jira: по каждой задаче — в какие дни и сколько часов списать.</span>}
      </div>
      {mode === "days"
        ? <Weeks a={a} updateDay={updateDay} onlyReview={onlyReview} open={open} toggle={toggle} />
        : <ByTask a={a} />}
    </div>
  );
}

/** Period story, days to check and where the time went — above the list, using the full width. */
function Overview({ a, review, onJump, onAi }: { a: Analysis; review: DayPlan[]; onJump: (date: string) => void; onAi: () => void }) {
  const [more, setMore] = useState(false);
  const rows = totalsByTask(a);
  const total = rows.reduce((s, r) => s + r.hours, 0) || 1;
  const long = a.narrative.length > 360;
  return (
    <div className="overview">
      <div className="ov-left">
        <section className="card ov-card">
          <div className="ov-h"><h4>О чём период</h4><button className="linkbtn" onClick={onAi}>Разбор ИИ →</button></div>
          <p className={`ov-text ${long && !more ? "clamp" : ""}`}>{a.narrative}</p>
          {long && <button className="linkbtn small" onClick={() => setMore(!more)}>{more ? "Свернуть" : "Показать полностью"}</button>}
        </section>
        {review.length > 0 && (
          <section className="card ov-card ov-review">
            <div className="ov-h"><h4>Что проверить</h4><span className="count warn">{review.length}</span></div>
            <ul>
              {review.map((d) => (
                <li key={d.date}>
                  <button onClick={() => onJump(d.date)}>
                    <i className={`lg ${d.basis === "inferred" ? "warn" : "bad"}`} />
                    <b>{weekdayName(d.date)} {formatRu(d.date).slice(0, 5)}</b>
                    <span>{reviewReason(d)}</span>
                    <svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <section className="card ov-card ov-dist">
        <div className="ov-h"><h4>Куда ушло время</h4><span className="muted">{rows.length} {plural(rows.length, "задача", "задачи", "задач")} · {fmtH(total)}&nbsp;ч</span></div>
        <ul className="dist-list">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="dl-top">
                <i className="dot" style={{ background: keyColor(r.key) }} />
                <IssueLink k={r.key} />
                <span className="dl-title" title={r.summary}>{r.summary}</span>
                <span className="dl-h">{fmtH(r.hours)}&nbsp;ч</span>
                <span className="dl-p">{Math.round((r.hours / total) * 100)}%</span>
              </div>
              <div className="dl-bar"><i style={{ width: `${(r.hours / total) * 100}%`, background: keyColor(r.key) }} /></div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Weeks(props: {
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
        const mm = w.days.reduce((s, d) => s + (d.off ? 0 : meetingMinutes(d)), 0);
        const target = w.days.reduce((s, d) => s + (d.off ? 0 : d.target), 0);
        const done = Math.abs(w.total - target) < 0.01;
        return (
          <section className="week" key={w.monday}>
            <header className="week-h">
              <h3>{formatRu(w.monday).slice(0, 5)} – {formatRu(w.sunday).slice(0, 5)}</h3>
              <span className="wk-meter"><i className={done ? "good" : "bad"} style={{ width: `${Math.min(100, target ? (w.total / target) * 100 : 0)}%` }} /></span>
              <span className={`wk-total ${done ? "ok" : "bad"}`}>{fmtH(w.total)}<small> / {fmtH(target)} ч</small></span>
              {mm > 0 && <span className="muted">встречи {fmtMinutes(mm)}</span>}
              <span className="spacer" />
              <CopyButton label="Копировать итоги" title="Даты и часы дней недели — для системы учёта по дням" text={() => w.days.map((d) => `${formatRu(d.date)}\t${fmtH(dayTotal(d))}`).join("\n")} />
            </header>
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

function Day({ a, d, open, onToggle, update }: { a: Analysis; d: DayPlan; open: boolean; onToggle: () => void; update: (fn: (d: DayPlan) => DayPlan) => void }) {
  const total = dayTotal(d);
  const balanced = d.off || Math.abs(total - d.target) < EPS;
  const setHoursFor = (key: string, v: number) =>
    update((x) => ({ ...x, tasks: x.tasks.map((t) => (t.key === key ? { ...t, hours: Math.max(0, v) } : t)) }));
  const srcs = sourceCounts(d);
  const mm = meetingMinutes(d);
  const tasks = d.tasks.filter((t) => t.hours > 0 || open);
  const shown = tasks.slice(0, 3);
  const status = d.off ? "off" : d.basis;

  return (
    <div id={`day-${d.date}`} className={`day s-${status} ${open ? "open" : ""}`}>
      <button className="day-sum" onClick={onToggle} aria-expanded={open}>
        <span className="d-date">
          <b>{Number(d.date.slice(8))}</b>
          <span>{weekdayName(d.date)}<br />{monthShort(d.date)}</span>
        </span>
        <span className="d-mid">
          {d.off ? (
            <span className="d-line muted">Выходной или отпуск — часы не списываются</span>
          ) : d.tasks.length === 0 ? (
            <span className="d-line bad">{reviewReason(d)}</span>
          ) : (
            <>
              <span className="d-chips">
                {shown.map((t) => (
                  <span key={t.key} className="d-chip" title={a.issues[t.key]?.summary}>
                    <i style={{ background: keyColor(t.key) }} />{t.key}<b>{fmtH(t.hours)}</b>
                  </span>
                ))}
                {tasks.length > shown.length && <span className="d-more">+{tasks.length - shown.length}</span>}
              </span>
              <span className={`d-line ${d.basis === "activity" ? "" : "warn"}`}>
                {d.basis === "activity" ? (d.summary || a.issues[d.tasks[0].key]?.summary) : reviewReason(d)}
              </span>
            </>
          )}
        </span>
        <span className="d-bar" aria-hidden>
          {!d.off && d.tasks.map((t) => t.hours > 0 && <i key={t.key} style={{ flex: t.hours, background: keyColor(t.key) }} />)}
        </span>
        <span className="d-meet">{mm > 0 && <>{fmtMinutes(mm)}<small>встречи</small></>}</span>
        <span className={`d-total ${balanced ? "" : "bad"}`}>
          {d.off ? "—" : fmtH(total)}{!d.off && <small> ч</small>}
          {!balanced && <em>норма {fmtH(d.target)}</em>}
        </span>
        <svg className="chev" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" /></svg>
      </button>

      {open && (
        <div className="day-body">
          {!d.off && (
            <div className="db-grid">
              <div className="db-tasks">
                <h5>Задачи и часы <span>для Jira</span></h5>
                {d.tasks.map((t) => (
                  <div className="dt-row" key={t.key}>
                    <i className="dot" style={{ background: keyColor(t.key) }} />
                    <div className="dt-main">
                      <div className="dt-head">
                        <IssueLink k={t.key} />
                        <span className="dt-title" title={a.issues[t.key]?.summary}>{a.issues[t.key]?.summary}</span>
                        {statusOnDate(a.issues[t.key], d.date) && <span className="t-status" title="Статус задачи в этот день по истории Jira">{statusOnDate(a.issues[t.key], d.date)}</span>}
                      </div>
                      {t.notes.length > 0 && <ul className="dt-notes">{t.notes.slice(0, 4).map((n, i) => <li key={i}>{n}</li>)}</ul>}
                    </div>
                    <Stepper small value={t.hours} step={STEP} min={0} max={24} suffix="ч" onChange={(v) => setHoursFor(t.key, v)} />
                  </div>
                ))}
                {d.tasks.length === 0 && <p className="muted">Задач нет — день пока не заполнен.</p>}
              </div>
              <div className="db-side">
                <h5>Что делали</h5>
                {d.summary && <p className="db-text">{d.summary}</p>}
                {d.reasoning && <p className="db-text muted">{d.reasoning}</p>}
                {srcs.length > 0 && (
                  <div className="st-srcs" title="Из чего собран день">
                    {srcs.map(([s, n]) => <span key={s} className={`src s-${s}`}><i />{SRC[s]} <b>{n}</b></span>)}
                  </div>
                )}
                {d.meetings.length > 0 && (
                  <>
                    <h5>Встречи и звонки <span>{fmtMinutes(mm)}</span></h5>
                    <ul className="db-meet">
                      {d.meetings.map((m, i) => (
                        <li key={i} className={m.isCall ? "call" : ""} title={`${m.title}${m.organizer ? "\nОрганизатор: " + m.organizer : ""}`}>
                          <b>{meetingRange(m)}</b><span>{m.title}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="db-actions">
            {!balanced && <button className="btn small" onClick={() => update(rebalance)}>Выровнять до {fmtH(d.target)} ч</button>}
            <button className="btn small ghost" onClick={() => update((x) => ({ ...x, off: !x.off }))}>{d.off ? "Вернуть рабочий день" : "Сделать выходным"}</button>
            <span className="spacer" />
            {!d.off && <CopyButton label="Копировать день" text={() => dayTextShort(a, d)} />}
          </div>
        </div>
      )}
    </div>
  );
}

const dayTextShort = (a: Analysis, d: DayPlan) =>
  `${formatRu(d.date)}\n` + d.tasks.map((t) => `${t.key} ${a.issues[t.key]?.summary ?? ""}: ${fmtH(t.hours)} ч`).join("\n") + `\nИтого: ${fmtH(dayTotal(d))} ч`;

function ByTask({ a }: { a: Analysis }) {
  const rows = totalsByTask(a);
  const total = rows.reduce((s, r) => s + r.hours, 0) || 1;
  const perTask = useMemo(() => {
    const m = new Map<string, { date: string; hours: number; note?: string }[]>();
    for (const d of a.days) {
      if (d.off) continue;
      for (const t of d.tasks) if (t.hours > 0) m.set(t.key, [...(m.get(t.key) ?? []), { date: d.date, hours: t.hours, note: t.notes[0] }]);
    }
    return m;
  }, [a]);
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
              <span className="tl-share"><i style={{ width: `${(r.hours / total) * 100}%`, background: keyColor(r.key) }} /></span>
              <span className="tl-days">{days.length}&nbsp;{plural(days.length, "день", "дня", "дней")}</span>
              <span className="tl-total">{fmtH(r.hours)}&nbsp;<small>ч</small></span>
              <CopyButton label="Копировать" title="Даты и часы по этой задаче" text={() => days.map((x) => `${formatRu(x.date)}\t${fmtH(x.hours)}`).join("\n")} />
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
