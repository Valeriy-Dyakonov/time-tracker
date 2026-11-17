import { useState } from "react";
import type { Analysis, DayPlan } from "../../types";
import { dayTotal } from "../../lib/allocate";
import { isoWeekday } from "../../lib/dates";
import { dateFull, useT, weekdayShort } from "../../i18n";
import { fmtH } from "../../lib/report";
import IssueLink from "../IssueLink";
import Meetings from "../Meetings";
import { Badge, Card, CopyButton, InfoTip, Title } from "../ui";
import { Evidence } from "./Evidence";

const BASIS_TONE: Record<DayPlan["basis"], "good" | "warn" | "bad"> = { activity: "good", inferred: "warn", empty: "bad" };

/** What the AI saw and why hours ended up where they did. */
export default function AiReview({ a }: { a: Analysis }) {
  const [onlyData, setOnlyData] = useState(false);
  const days = a.days.filter((d) => !onlyData || d.basis === "activity");
  const m = useT().review;
  return (
    <div>
      <Card>
        <div className="row">
          <Title tip={m.period.tip}>{m.period.title}</Title>
          <Badge tone={a.usedAi ? "good" : undefined}>{a.usedAi ? m.period.byAi : m.period.byTemplate}</Badge>
          <span className="spacer" />
          <CopyButton text={() => a.narrative} />
        </div>
        <p className="narrative full">{a.narrative}</p>
      </Card>

      <Card>
        <div className="row">
          <Title wide tip={m.days.tip}>{m.days.title}</Title>
          <span className="spacer" />
          <label className="check" title={m.days.onlyDataTitle}>
            <input type="checkbox" checked={onlyData} onChange={(e) => setOnlyData(e.target.checked)} /> {m.days.onlyData}
          </label>
          <InfoTip>{m.days.onlyDataTip}</InfoTip>
        </div>
        {days.map((d) => <ReviewDay key={d.date} a={a} d={d} />)}
      </Card>
    </div>
  );
}

function ReviewDay({ a, d }: { a: Analysis; d: DayPlan }) {
  const t = useT();
  const m = t.review;
  return (
    <article className="review-day">
      <header>
        <b>{weekdayShort(isoWeekday(d.date))} {dateFull(d.date)}</b>
        <span className="rd-total">{t.common.hoursValue(fmtH(dayTotal(d)))}</span>
        <Badge tone={BASIS_TONE[d.basis]}>{m.basis[d.basis]}</Badge>
      </header>
      {d.summary && d.basis === "activity" && (
        <section className="rd-block">
          <h6 className="rd-h">{m.days.summary}</h6>
          <p className="rd-summary">{d.summary}</p>
        </section>
      )}
      {d.tasks.length > 0 && (
        <section className="rd-block">
          <h6 className="rd-h">{m.days.tasks} <span>{d.tasks.length}</span></h6>
          <ul className="rtasks">
            {d.tasks.map((task) => (
              <li key={task.key}>
                <div className="rt-line">
                  <IssueLink k={task.key} />
                  <span className="rt-title">{a.issues[task.key]?.summary}</span>
                  <b className="rt-h">{fmtH(task.hours)}&nbsp;{t.common.h}</b>
                </div>
                {task.notes.length > 0 && <ul className="rt-notes">{task.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.reasoning && (
        <section className="rd-block">
          <h6 className="rd-h">{m.days.reasoning}</h6>
          <p className="reasoning">{d.reasoning}</p>
        </section>
      )}
      <Meetings d={d} />
      <Evidence d={d} />
    </article>
  );
}
