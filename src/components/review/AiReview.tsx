import { useState } from "react";
import type { Analysis, DayPlan } from "../../types";
import { dayTotal } from "../../lib/allocate";
import { formatRu, weekdayName } from "../../lib/dates";
import { fmtH } from "../../lib/report";
import IssueLink from "../IssueLink";
import Meetings from "../Meetings";
import { Badge, Card, CopyButton, InfoTip, Title } from "../ui";
import { Evidence } from "./Evidence";

const BASIS_BADGE: Record<DayPlan["basis"], ["good" | "warn" | "bad", string]> = {
  activity: ["good", "по данным дня"],
  inferred: ["warn", "без данных"],
  empty: ["bad", "пусто"],
};

/** What the AI saw and why hours ended up where they did. */
export default function AiReview({ a }: { a: Analysis }) {
  const [onlyData, setOnlyData] = useState(false);
  const days = a.days.filter((d) => !onlyData || d.basis === "activity");
  return (
    <div>
      <Card>
        <div className="row">
          <Title tip="Связный пересказ периода по задачам и событиям. Можно скопировать и отправить руководителю или вставить в отчёт.">Итог периода</Title>
          <Badge tone={a.usedAi ? "good" : undefined}>{a.usedAi ? "написано ИИ" : "шаблон, без ИИ"}</Badge>
          <span className="spacer" />
          <CopyButton text={() => a.narrative} />
        </div>
        <p className="narrative full">{a.narrative}</p>
      </Card>

      <Card>
        <div className="row">
          <Title wide tip="Для каждого дня: почему часы разделились именно так, какие задачи и заметки получились, какие были встречи и какие события нашлись в источниках. Помогает проверить, что ИИ понял день правильно.">Как считался каждый день</Title>
          <span className="spacer" />
          <label className="check" title="Скрыть дни без собственных событий — у них часы взяты с соседних дней или по периоду">
            <input type="checkbox" checked={onlyData} onChange={(e) => setOnlyData(e.target.checked)} /> только дни с данными
          </label>
          <InfoTip>Оставить только дни, где были ваши события (коммиты, задачи, сообщения, встречи). Дни, заполненные по соседним или по периоду, скроются.</InfoTip>
        </div>
        {days.map((d) => <ReviewDay key={d.date} a={a} d={d} />)}
      </Card>
    </div>
  );
}

function ReviewDay({ a, d }: { a: Analysis; d: DayPlan }) {
  const [tone, label] = BASIS_BADGE[d.basis];
  return (
    <article className="review-day">
      <header>
        <b>{weekdayName(d.date)} {formatRu(d.date)}</b>
        <span className="rd-total">{fmtH(dayTotal(d))} ч</span>
        <Badge tone={tone}>{label}</Badge>
      </header>
      {d.summary && d.basis === "activity" && (
        <section className="rd-block">
          <h6 className="rd-h">Кратко о дне</h6>
          <p className="rd-summary">{d.summary}</p>
        </section>
      )}
      {d.tasks.length > 0 && (
        <section className="rd-block">
          <h6 className="rd-h">Задачи <span>{d.tasks.length}</span></h6>
          <ul className="rtasks">
            {d.tasks.map((t) => (
              <li key={t.key}>
                <div className="rt-line">
                  <IssueLink k={t.key} />
                  <span className="rt-title">{a.issues[t.key]?.summary}</span>
                  <b className="rt-h">{fmtH(t.hours)}&nbsp;ч</b>
                </div>
                {t.notes.length > 0 && <ul className="rt-notes">{t.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.reasoning && (
        <section className="rd-block">
          <h6 className="rd-h">Почему такие доли</h6>
          <p className="reasoning">{d.reasoning}</p>
        </section>
      )}
      <Meetings d={d} />
      <Evidence d={d} />
    </article>
  );
}
