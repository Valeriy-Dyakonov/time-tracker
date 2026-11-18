import { useState } from "react";
import type { Analysis } from "../../types";
import { count, dateShort, useT, weekdayShort } from "../../i18n";
import { isoWeekday } from "../../lib/dates";
import { fmtH } from "../../lib/report";
import { rowId } from "../../lib/submit";
import type { PlannedWrite } from "../../lib/worklogSync";
import IssueLink from "../IssueLink";
import { Button, keyColor } from "../ui";

/** "Log all": the exact list of worklogs to be created, reviewed and confirmed by the user before anything is sent. */
export function BulkReview(props: {
  a: Analysis;
  plan: PlannedWrite[];
  onConfirm: (plan: PlannedWrite[], onStep: (done: number) => void) => Promise<number>;
  onClose: () => void;
}) {
  const t = useT();
  const m = t.submit.jira;
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const chosen = props.plan.filter((p) => !skip.has(rowId(p.row)));
  const hours = fmtH(chosen.reduce((s, p) => s + p.minutes, 0) / 60);
  const running = progress !== null && result === null;

  const toggle = (id: string) => setSkip((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  async function go() {
    setProgress(0);
    const failed = await props.onConfirm(chosen, setProgress);
    setResult(m.result(chosen.length - failed, failed));
  }

  return (
    <section className="bulk">
      <h4>{m.reviewTitle}</h4>
      <p className="muted">{m.reviewIntro(count(props.plan.length, m.rows), fmtH(props.plan.reduce((s, p) => s + p.minutes, 0) / 60))}</p>
      <div className="bulk-list">
        {props.plan.map((p) => {
          const id = rowId(p.row);
          return (
            <label key={id} className={`bulk-row ${skip.has(id) ? "off" : ""}`}>
              <input type="checkbox" checked={!skip.has(id)} disabled={progress !== null} onChange={() => toggle(id)} title={m.include} />
              <span className="nw">{weekdayShort(isoWeekday(p.row.date))} {dateShort(p.row.date)}</span>
              <span className="nw"><span className="dot" style={{ background: keyColor(p.row.key) }} /> <IssueLink k={p.row.key} /></span>
              <b className="nw">{fmtH(p.minutes / 60)}</b>
              <span className="bulk-desc" title={props.a.issues[p.row.key]?.summary}>
                {p.topUp && <span className="bulk-tag" title={m.topUpTitle}>{m.topUpMark}</span>}
                {p.comment}
              </span>
            </label>
          );
        })}
      </div>
      <div className="bulk-bar">
        {running && <span className="muted">{m.progress(progress, chosen.length)}</span>}
        {result && <span>{result}</span>}
        <span className="spacer" />
        {result === null && (
          <>
            <Button variant="ghost" size="small" disabled={running} onClick={props.onClose}>{t.submit.row.cancel}</Button>
            <Button variant="primary" size="small" disabled={running || chosen.length === 0} onClick={go}>
              {m.confirm(count(chosen.length, m.rows), hours)}
            </Button>
          </>
        )}
        {result !== null && <Button size="small" onClick={props.onClose}>{m.close}</Button>}
      </div>
    </section>
  );
}
