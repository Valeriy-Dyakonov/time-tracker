import { useState } from "react";
import type { Analysis, DayPlan } from "../../types";
import { formatRu, plural, weekdayName } from "../../lib/dates";
import { fmtH, totalsByTask } from "../../lib/report";
import IssueLink from "../IssueLink";
import { InfoTip, keyColor } from "../ui";
import { percent, reviewReason } from "./review";

const LONG_STORY = 360;

export function Overview({ a, review, onJump, onAi }: { a: Analysis; review: DayPlan[]; onJump: (date: string) => void; onAi: () => void }) {
  return (
    <div className="overview">
      <div className="ov-left">
        <Story text={a.narrative} usedAi={a.usedAi} onAi={onAi} />
        {review.length > 0 && <ReviewList days={review} onJump={onJump} />}
      </div>
      <Distribution a={a} />
    </div>
  );
}

function Story({ text, usedAi, onAi }: { text: string; usedAi: boolean; onAi: () => void }) {
  const [more, setMore] = useState(false);
  const long = text.length > LONG_STORY;
  return (
    <section className="card ov-card">
      <div className="ov-h">
        <h4>О чём период<InfoTip>{usedAi ? "Краткий пересказ периода, который написал ИИ по задачам и событиям." : "Пересказ периода по шаблону: ИИ не использовался."} Подходит как основа для отчёта руководителю.</InfoTip></h4>
        <button className="linkbtn" onClick={onAi}>Разбор ИИ →</button>
      </div>
      <p className={`ov-text ${long && !more ? "clamp" : ""}`}>{text}</p>
      {long && <button className="linkbtn small" onClick={() => setMore(!more)}>{more ? "Свернуть" : "Показать полностью"}</button>}
    </section>
  );
}

function ReviewList({ days, onJump }: { days: DayPlan[]; onJump: (date: string) => void }) {
  return (
    <section className="card ov-card ov-review">
      <div className="ov-h">
        <h4>Что проверить<InfoTip>Дни, где часы получены не из ваших событий (взяты с соседнего дня или по периоду) или сумма не равна норме. Нажмите на день — он раскроется в списке ниже.</InfoTip></h4>
        <span className="count warn">{days.length}</span>
      </div>
      <ul>
        {days.map((d) => (
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
  );
}

function Distribution({ a }: { a: Analysis }) {
  const rows = totalsByTask(a);
  const total = rows.reduce((s, r) => s + r.hours, 0) || 1;
  return (
    <section className="card ov-card ov-dist">
      <div className="ov-h">
        <h4>Куда ушло время<InfoTip>Сколько часов за период пришлось на каждую задачу и какая это доля от всех часов.</InfoTip></h4>
        <span className="muted">{rows.length} {plural(rows.length, "задача", "задачи", "задач")} · {fmtH(total)}&nbsp;ч</span>
      </div>
      <ul className="dist-list">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="dl-top">
              <i className="dot" style={{ background: keyColor(r.key) }} />
              <IssueLink k={r.key} />
              <span className="dl-title" title={r.summary}>{r.summary}</span>
              <span className="dl-h">{fmtH(r.hours)}&nbsp;ч</span>
              <span className="dl-p">{Math.round(percent(r.hours, total))}%</span>
            </div>
            <div className="dl-bar"><i style={{ width: `${percent(r.hours, total)}%`, background: keyColor(r.key) }} /></div>
          </li>
        ))}
      </ul>
    </section>
  );
}
