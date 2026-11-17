import type { Analysis, DayPlan } from "../../types";
import { dayTotal, rebalance, statusOnDate, STEP } from "../../lib/allocate";
import { monthShort, weekdayName } from "../../lib/dates";
import { fmtH, fmtMinutes, meetingMinutes, meetingRange } from "../../lib/report";
import IssueLink from "../IssueLink";
import { Button, CopyButton, InfoTip, keyColor, Stepper } from "../ui";
import { dayCopyText, isBalanced, reviewReason, sourceCounts } from "./review";
import { SourceChips } from "./SourceChips";

const CHIPS_IN_SUMMARY = 3;

export type DayUpdate = (fn: (d: DayPlan) => DayPlan) => void;

export function Day({ a, d, open, onToggle, update }: { a: Analysis; d: DayPlan; open: boolean; onToggle: () => void; update: DayUpdate }) {
  return (
    <div id={`day-${d.date}`} className={`day s-${d.off ? "off" : d.basis} ${open ? "open" : ""}`}>
      <DaySummary a={a} d={d} open={open} onToggle={onToggle} />
      {open && <DayDetails a={a} d={d} update={update} />}
    </div>
  );
}

function DaySummary({ a, d, open, onToggle }: { a: Analysis; d: DayPlan; open: boolean; onToggle: () => void }) {
  const total = dayTotal(d);
  const balanced = isBalanced(d);
  const mm = meetingMinutes(d);
  const tasks = d.tasks.filter((t) => t.hours > 0);
  const shown = tasks.slice(0, CHIPS_IN_SUMMARY);

  return (
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
        {!d.off && tasks.map((t) => <i key={t.key} style={{ flex: t.hours, background: keyColor(t.key) }} />)}
      </span>
      <span className="d-meet">{mm > 0 && <>{fmtMinutes(mm)}<small>встречи</small></>}</span>
      <span className={`d-total ${balanced ? "" : "bad"}`}>
        {d.off ? "—" : fmtH(total)}{!d.off && <small> ч</small>}
        {!balanced && <em>норма {fmtH(d.target)}</em>}
      </span>
      <svg className="chev" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" /></svg>
    </button>
  );
}

function DayDetails({ a, d, update }: { a: Analysis; d: DayPlan; update: DayUpdate }) {
  const balanced = isBalanced(d);
  const setHoursFor = (key: string, v: number) =>
    update((x) => ({ ...x, tasks: x.tasks.map((t) => (t.key === key ? { ...t, hours: Math.max(0, v) } : t)) }));

  return (
    <div className="day-body">
      {!d.off && (
        <div className="db-grid">
          <div className="db-tasks">
            <h5>Задачи и часы <span>для Jira</span><InfoTip>Сколько часов списать на каждую задачу в этот день. Часы можно поправить кнопками − и + или ввести число; итог дня пересчитается.</InfoTip></h5>
            {d.tasks.map((t) => {
              const status = statusOnDate(a.issues[t.key], d.date);
              return (
                <div className="dt-row" key={t.key}>
                  <i className="dot" style={{ background: keyColor(t.key) }} />
                  <div className="dt-main">
                    <div className="dt-head">
                      <IssueLink k={t.key} />
                      <span className="dt-title" title={a.issues[t.key]?.summary}>{a.issues[t.key]?.summary}</span>
                      {status && <span className="t-status" title="Статус задачи в этот день по истории Jira">{status}</span>}
                    </div>
                    {t.notes.length > 0 && <ul className="dt-notes">{t.notes.slice(0, 4).map((n, i) => <li key={i}>{n}</li>)}</ul>}
                  </div>
                  <Stepper small value={t.hours} step={STEP} min={0} max={24} suffix="ч" onChange={(v) => setHoursFor(t.key, v)} />
                </div>
              );
            })}
            {d.tasks.length === 0 && <p className="muted">Задач нет — день пока не заполнен.</p>}
          </div>
          <DaySide d={d} />
        </div>
      )}
      <div className="db-actions">
        {!balanced && (
          <Button size="small" onClick={() => update(rebalance)} title="Пропорционально изменить часы задач так, чтобы сумма дня стала равна норме">
            Выровнять до {fmtH(d.target)} ч
          </Button>
        )}
        <Button variant="ghost" size="small" onClick={() => update((x) => ({ ...x, off: !x.off }))}
          title={d.off ? "Снова считать день рабочим и списывать на него часы" : "Отпуск, больничный или отгул: день не попадёт в списание и норму"}>
          {d.off ? "Вернуть рабочий день" : "Сделать выходным"}
        </Button>
        <span className="spacer" />
        {!d.off && <CopyButton label="Копировать день" title="Задачи и часы этого дня текстом — чтобы вставить в чат или заметку" text={() => dayCopyText(a, d)} />}
      </div>
    </div>
  );
}

function DaySide({ d }: { d: DayPlan }) {
  const mm = meetingMinutes(d);
  return (
    <div className="db-side">
      <h5>Что делали<InfoTip>Краткое описание дня и почему часы разделились именно так. Ниже — из каких источников собраны события.</InfoTip></h5>
      {d.summary && <p className="db-text">{d.summary}</p>}
      {d.reasoning && <p className="db-text muted">{d.reasoning}</p>}
      <SourceChips counts={sourceCounts([d])} title="Из чего собран день" />
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
  );
}
