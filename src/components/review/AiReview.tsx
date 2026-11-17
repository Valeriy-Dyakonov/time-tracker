import { useState } from "react";
import type { Analysis, DayPlan } from "../../types";
import { dayTotal } from "../../lib/allocate";
import { formatRu, weekdayName } from "../../lib/dates";
import { fmtH } from "../../lib/report";
import IssueLink from "../IssueLink";
import Meetings from "../Meetings";
import { CopyButton, InfoTip, Title } from "../ui";
import { Evidence } from "./Evidence";

const BASIS_BADGE: Record<DayPlan["basis"], [string, string]> = {
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
      <section className="card">
        <div className="row">
          <Title tip="Связный пересказ периода по задачам и событиям. Можно скопировать и отправить руководителю или вставить в отчёт.">Итог периода</Title>
          <span className={`badge ${a.usedAi ? "good" : ""}`}>{a.usedAi ? "написано ИИ" : "шаблон, без ИИ"}</span>
          <span className="spacer" />
          <CopyButton text={() => a.narrative} />
        </div>
        <p className="narrative full">{a.narrative}</p>
      </section>

      <section className="card">
        <div className="row">
          <Title wide tip="Для каждого дня: почему часы разделились именно так, какие задачи и заметки получились, какие были встречи и какие события нашлись в источниках. Помогает проверить, что ИИ понял день правильно.">Как считался каждый день</Title>
          <span className="spacer" />
          <label className="check" title="Скрыть дни без собственных событий — у них часы взяты с соседних дней или по периоду">
            <input type="checkbox" checked={onlyData} onChange={(e) => setOnlyData(e.target.checked)} /> только дни с данными
          </label>
          <InfoTip>Оставить только дни, где были ваши события (коммиты, задачи, сообщения, встречи). Дни, заполненные по соседним или по периоду, скроются.</InfoTip>
        </div>
        {days.map((d) => <ReviewDay key={d.date} a={a} d={d} />)}
      </section>
    </div>
  );
}

function ReviewDay({ a, d }: { a: Analysis; d: DayPlan }) {
  const [cls, label] = BASIS_BADGE[d.basis];
  return (
    <article className="review-day">
      <header>
        <b>{weekdayName(d.date)} {formatRu(d.date)}</b>
        <span className="rd-total">{fmtH(dayTotal(d))} ч</span>
        <span className={`badge ${cls}`}>{label}</span>
      </header>
      {d.reasoning && <p className="reasoning">{d.reasoning}</p>}
      {d.tasks.length > 0 && (
        <ul className="rtasks">
          {d.tasks.map((t) => (
            <li key={t.key}>
              <b><IssueLink k={t.key} /></b> {a.issues[t.key]?.summary} — {fmtH(t.hours)} ч
              {t.notes.length > 0 && <span className="muted"> · {t.notes.join("; ")}</span>}
            </li>
          ))}
        </ul>
      )}
      {d.summary && d.basis === "activity" && <p className="muted">Краткое описание дня: {d.summary}</p>}
      <Meetings d={d} />
      <Evidence d={d} />
    </article>
  );
}
