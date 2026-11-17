import { useState } from "react";
import type { Analysis } from "../types";
import { dayTotal } from "../lib/allocate";
import { formatRu, weekdayName } from "../lib/dates";
import { fmtH } from "../lib/report";
import { CopyButton } from "./ui";
import { clock } from "./live";
import IssueLink from "./IssueLink";
import Meetings from "./Meetings";

const SRC: Record<string, string> = { jira: "Jira", git: "Git", gitlab: "GitLab", matrix: "Matrix", confluence: "Confluence", calendar: "Календарь" };

/** Human-readable explanation: what the AI saw and why hours ended up where they did. */
export default function AiReview({ a }: { a: Analysis }) {
  const [onlyData, setOnlyData] = useState(false);
  const days = a.days.filter((d) => !onlyData || d.basis === "activity");
  return (
    <div>
      <section className="card">
        <div className="row">
          <h3 style={{ margin: 0 }}>Итог периода</h3>
          <span className={`badge ${a.usedAi ? "good" : ""}`}>{a.usedAi ? "написано ИИ" : "шаблон, без ИИ"}</span>
          <span className="spacer" />
          <CopyButton text={() => a.narrative} />
        </div>
        <p className="narrative">{a.narrative}</p>
      </section>

      <section className="card">
        <div className="row">
          <h3 style={{ margin: 0 }}>Как считался каждый день</h3>
          <span className="spacer" />
          <label className="check"><input type="checkbox" checked={onlyData} onChange={(e) => setOnlyData(e.target.checked)} /> только дни с данными</label>
        </div>
        {days.map((d) => (
          <article className="review-day" key={d.date}>
            <header>
              <b>{weekdayName(d.date)} {formatRu(d.date)}</b>
              <span className="rd-total">{fmtH(dayTotal(d))} ч</span>
              {d.basis === "activity" && <span className="badge good">по данным дня</span>}
              {d.basis === "inferred" && <span className="badge warn">без данных</span>}
              {d.basis === "empty" && <span className="badge bad">пусто</span>}
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
            {d.evidence.length > 0 && (
              <details className="evidence">
                <summary>Что нашлось в этот день ({d.eventCount})</summary>
                <table className="table">
                  <tbody>
                    {d.evidence.map((e, i) => (
                      <tr key={i}>
                        <td className="mono">{clock(e.ts).slice(0, 5)}</td>
                        <td>{SRC[e.source] ?? e.source}</td>
                        <td>{e.key ? <IssueLink k={e.key} /> : <span className="muted">без ключа</span>}</td>
                        <td>{e.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
