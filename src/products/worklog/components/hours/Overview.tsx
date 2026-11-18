import { useState } from "react";
import type { Analysis, DayPlan } from "@/shared/types";
import { count, dateShort, useT, weekdayShort } from "@/i18n";
import { isoWeekday } from "@/shared/lib/dates";
import { fmtH, totalsByTask } from "../../lib/report/report";
import IssueLink from "@/shared/components/IssueLink";
import { Button, Card, InfoTip, keyColor } from "@/shared/ui";
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
  const all = useT();
  const t = all.hours.overview;
  const [more, setMore] = useState(false);
  const long = text.length > LONG_STORY;
  return (
    <Card className="ov-card">
      <div className="ov-h">
        <h4>{t.story}<InfoTip>{usedAi ? t.storyAiTip : t.storyTemplateTip}{t.storyTipTail}</InfoTip></h4>
        <Button variant="link" onClick={onAi}>{t.toAiReview}</Button>
      </div>
      <p className={`ov-text ${long && !more ? "clamp" : ""}`}>{text}</p>
      {long && <Button variant="link" className="small" onClick={() => setMore(!more)}>{more ? all.common.collapse : all.common.showAll}</Button>}
    </Card>
  );
}

function ReviewList({ days, onJump }: { days: DayPlan[]; onJump: (date: string) => void }) {
  const t = useT().hours.overview;
  return (
    <Card className="ov-card ov-review">
      <div className="ov-h">
        <h4>{t.check}<InfoTip>{t.checkTip}</InfoTip></h4>
        <span className="count warn">{days.length}</span>
      </div>
      <ul>
        {days.map((d) => (
          <li key={d.date}>
            <button onClick={() => onJump(d.date)}>
              <i className={`lg ${d.basis === "inferred" ? "warn" : "bad"}`} />
              <b>{weekdayShort(isoWeekday(d.date))} {dateShort(d.date)}</b>
              <span>{reviewReason(d)}</span>
              <svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" /></svg>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Distribution({ a }: { a: Analysis }) {
  const all = useT();
  const t = all.hours.overview;
  const rows = totalsByTask(a);
  const total = rows.reduce((s, r) => s + r.hours, 0) || 1;
  return (
    <Card className="ov-card ov-dist">
      <div className="ov-h">
        <h4>{t.distribution}<InfoTip>{t.distributionTip}</InfoTip></h4>
        <span className="muted">{count(rows.length, all.common.task)} · {fmtH(total)}&nbsp;{all.common.h}</span>
      </div>
      <ul className="dist-list">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="dl-top">
              <i className="dot" style={{ background: keyColor(r.key) }} />
              <IssueLink k={r.key} />
              <span className="dl-title" title={r.summary}>{r.summary}</span>
              <span className="dl-h">{fmtH(r.hours)}&nbsp;{all.common.h}</span>
              <span className="dl-p">{Math.round(percent(r.hours, total))}%</span>
            </div>
            <div className="dl-bar"><i style={{ width: `${percent(r.hours, total)}%`, background: keyColor(r.key) }} /></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
