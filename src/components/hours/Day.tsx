import type { Analysis, DayPlan } from "../../types";
import { dayTotal, rebalance, statusOnDate, STEP } from "../../lib/allocate";
import { monthShortName, useT, weekdayShort } from "../../i18n";
import { isoWeekday, parseDate } from "../../lib/dates";
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
  const all = useT();
  const t = all.hours.day;
  const total = dayTotal(d);
  const balanced = isBalanced(d);
  const mm = meetingMinutes(d);
  const tasks = d.tasks.filter((t) => t.hours > 0);
  const shown = tasks.slice(0, CHIPS_IN_SUMMARY);

  return (
    <button className="day-sum" onClick={onToggle} aria-expanded={open}>
      <span className="d-date">
        <b>{Number(d.date.slice(8))}</b>
        <span>{weekdayShort(isoWeekday(d.date))}<br />{monthShortName(parseDate(d.date).getMonth())}</span>
      </span>
      <span className="d-mid">
        {d.off ? (
          <span className="d-line muted">{t.off}</span>
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
      <span className="d-meet">{mm > 0 && <>{fmtMinutes(mm)}<small>{t.meetings}</small></>}</span>
      <span className={`d-total ${balanced ? "" : "bad"}`}>
        {d.off ? "—" : fmtH(total)}{!d.off && <small> {all.common.h}</small>}
        {!balanced && <em>{t.norm(fmtH(d.target))}</em>}
      </span>
      <svg className="chev" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" /></svg>
    </button>
  );
}

function DayDetails({ a, d, update }: { a: Analysis; d: DayPlan; update: DayUpdate }) {
  const all = useT();
  const t = all.hours.day;
  const balanced = isBalanced(d);
  const setHoursFor = (key: string, v: number) =>
    update((x) => ({ ...x, tasks: x.tasks.map((t) => (t.key === key ? { ...t, hours: Math.max(0, v) } : t)) }));

  return (
    <div className="day-body">
      {!d.off && (
        <div className="db-grid">
          <div className="db-tasks">
            <h5>{t.tasks} <span>{t.forJira}</span><InfoTip>{t.tasksTip}</InfoTip></h5>
            {d.tasks.map((task) => {
              const status = statusOnDate(a.issues[task.key], d.date);
              return (
                <div className="dt-row" key={task.key}>
                  <i className="dot" style={{ background: keyColor(task.key) }} />
                  <div className="dt-main">
                    <div className="dt-head">
                      <IssueLink k={task.key} />
                      <span className="dt-title" title={a.issues[task.key]?.summary}>{a.issues[task.key]?.summary}</span>
                      {status && <span className="t-status" title={t.statusHint}>{status}</span>}
                    </div>
                    {task.notes.length > 0 && <ul className="dt-notes">{task.notes.slice(0, 4).map((n, i) => <li key={i}>{n}</li>)}</ul>}
                  </div>
                  <Stepper small value={task.hours} step={STEP} min={0} max={24} suffix={all.common.h} onChange={(v) => setHoursFor(task.key, v)} />
                </div>
              );
            })}
            {d.tasks.length === 0 && <p className="muted">{t.noTasks}</p>}
          </div>
          <DaySide d={d} />
        </div>
      )}
      <div className="db-actions">
        {!balanced && (
          <Button size="small" onClick={() => update(rebalance)} title={t.rebalanceHint}>
            {t.rebalance(fmtH(d.target))}
          </Button>
        )}
        <Button variant="ghost" size="small" onClick={() => update((x) => ({ ...x, off: !x.off }))}
          title={d.off ? t.makeWorkingHint : t.makeOffHint}>
          {d.off ? t.makeWorking : t.makeOff}
        </Button>
        <span className="spacer" />
        {!d.off && <CopyButton label={t.copy} title={t.copyHint} text={() => dayCopyText(a, d)} />}
      </div>
    </div>
  );
}

function DaySide({ d }: { d: DayPlan }) {
  const all = useT();
  const t = all.hours.day;
  const mm = meetingMinutes(d);
  return (
    <div className="db-side">
      <h5>{t.whatDone}<InfoTip>{t.whatDoneTip}</InfoTip></h5>
      {d.summary && <p className="db-text">{d.summary}</p>}
      {d.reasoning && <p className="db-text muted">{d.reasoning}</p>}
      <SourceChips counts={sourceCounts([d])} title={t.sourcesHint} />
      {d.meetings.length > 0 && (
        <>
          <h5>{t.meetingsTitle} <span>{fmtMinutes(mm)}</span></h5>
          <ul className="db-meet">
            {d.meetings.map((m, i) => (
              <li key={i} className={m.isCall ? "call" : ""} title={`${m.title}${m.organizer ? "\n" + all.shell.meetings.organizer(m.organizer) : ""}`}>
                <b>{meetingRange(m)}</b><span>{m.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
