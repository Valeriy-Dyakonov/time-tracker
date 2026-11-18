import { useMemo, useState } from "react";
import type { Analysis } from "@/shared/types";
import { isoWeekday } from "@/shared/lib/dates";
import { count, dateFull, dateShort, useT, weekdayShort } from "@/i18n";
import { fmtH } from "../../../lib/report/report";
import { rowId, worklogRows, type HoursFormat, type WorklogRow as PlanRow } from "../../../lib/submit/rows";
import { applyEdits, editCount, NO_EDITS, removeRow, restoreRow, setHours, type EditedRow as Row, type RowEdits } from "../../../lib/submit/edits";
import { checkLimits, perDay } from "../../../lib/submit/limits";
import { AddRow } from "./AddRow";
import { LimitWarnings, limitText } from "./LimitWarnings";
import { useStored } from "@/shared/hooks/useStored";
import IssueLink from "@/shared/components/IssueLink";
import { Button, Card, InfoTip, keyColor, Segmented } from "@/shared/ui";
import { BulkReview } from "./BulkReview";
import { StepHeader } from "../StepHeader";
import type { JiraSync } from "../useJiraSync";
import { bulkPlan, dayMatches, indexWorklogs, minutes, mismatchedDays, unplanned, type PlannedWrite } from "../../../lib/submit/sync";
import { DayMatchChip, PeriodMatch, Unplanned } from "./JiraCompare";
import { WorklogRow, type RowLabel } from "./WorklogRow";

type Group = "tasks" | "days";

const sumHours = (rs: Row[]) => rs.reduce((s, r) => s + r.hours, 0);

function groupBy(rows: Row[], key: (r: Row) => string): [string, Row[]][] {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m.entries()];
}

/** Step 1: copy hours and descriptions into Tempo row by row, ticking off what is done. */
export function TempoStep({ a, storeId, jira }: { a: Analysis; storeId: string; jira: JiraSync }) {
  const [done, setDone] = useStored<Record<string, boolean>>(`${storeId}.done`, {});
  const [comments, setComments] = useStored<Record<string, string>>(`${storeId}.comments`, {});
  const [fmt, setFmt] = useStored<HoursFormat>("worklog.submit.fmt", "hm");
  const [group, setGroup] = useState<Group>("tasks");
  const t = useT();
  const m = t.submit.tempo;

  const [edits, setEdits] = useStored<RowEdits>(`${storeId}.edits`, NO_EDITS);
  const [adding, setAdding] = useState(false);
  const planRows = useMemo(() => worklogRows(a), [a]);
  const rows = useMemo(() => applyEdits(planRows, edits), [planRows, edits]);
  const removed = planRows.filter((r) => edits.removed[rowId(r)]);
  const byTask = useMemo(() => groupBy(rows, (r) => r.key).sort((x, y) => sumHours(y[1]) - sumHours(x[1])), [rows]);
  const byDay = useMemo(() => groupBy(rows, (r) => r.date).sort((x, y) => x[0].localeCompare(y[0])), [rows]);
  const [reviewing, setReviewing] = useState(false);
  const comment = (r: PlanRow) => comments[rowId(r)] ?? r.comment;
  /** Filled in Jira counts as done; the manual tick still works for rows logged elsewhere. */
  const isDone = (r: Row) => !!done[rowId(r)] || ["full", "over"].includes(jira.sync(r)?.state ?? "");
  const doneRows = rows.filter(isDone);
  const pct = rows.length ? (doneRows.length / rows.length) * 100 : 0;

  // Built on demand: the review keeps its own copy, so later edits do not change what is being sent.
  const plan = () => bulkPlan(rows, indexWorklogs(rows.flatMap((r) => jira.sync(r)?.entries ?? [])), comment);
  const days = useMemo(() => dayMatches(rows, jira.list), [rows, jira.list]);
  const extra = useMemo(() => unplanned(rows, jira.list), [rows, jira.list]);
  const missingMin = rows.reduce((s, r) => s + (jira.sync(r)?.missing ?? 0), 0);

  // Limits: the plan as edited, and Jira after a write (everything already logged plus what is about to be sent).
  const planLimits = checkLimits(perDay(rows.map((r) => ({ date: r.date, minutes: minutes(r.hours) }))), a.days, a.start, a.end);
  const jiraMinutes = jira.list.map((w) => ({ date: w.date, minutes: Math.round(w.seconds / 60) }));
  const limitsAfter = (writes: PlannedWrite[]) =>
    checkLimits(perDay([...jiraMinutes, ...writes.map((p) => ({ date: p.row.date, minutes: p.minutes }))]), a.days, a.start, a.end);

  /** Reading Jira: the comparison is stale until it ends, so every action of this step waits. */
  const locked = jira.load.kind === "loading";
  /** Writing to Jira: a reload now would race the writes. */
  const writing = Object.values(jira.actions).some((x) => x.busy);

  const jiraBar = (
    <div className="ts-bar jira-bar">
      {jira.load.kind === "loading" && <span className="muted">{t.submit.jira.loading}</span>}
      {jira.load.kind === "error" && <span className="wl-err">{t.submit.jira.loadFailed(jira.load.error)}</span>}
      {jira.load.kind === "ok" && <PeriodMatch days={days} mismatched={mismatchedDays(days)} />}
      <span className="spacer" />
      <Button variant="ghost" size="small" title={t.submit.jira.refreshTitle} disabled={locked || writing || reviewing} onClick={() => void jira.reload()}>
        {t.submit.jira.refresh}
      </Button>
      {jira.load.kind === "ok" && (
        <Button variant="primary" size="small" title={t.submit.jira.submitAllTitle} disabled={missingMin === 0 || reviewing} onClick={() => setReviewing(true)}>
          {missingMin === 0 ? t.submit.jira.nothing : t.submit.jira.submitAll}
        </Button>
      )}
    </div>
  );

  const line = (r: Row, label: RowLabel) => (
    <WorklogRow
      key={rowId(r)}
      a={a}
      row={r}
      label={label}
      fmt={fmt}
      done={isDone(r)}
      comment={comment(r)}
      onToggle={() => setDone((p) => ({ ...p, [rowId(r)]: !p[rowId(r)] }))}
      onComment={(text) => setComments((p) => ({ ...p, [rowId(r)]: text }))}
      onHours={(h) => setEdits((e) => setHours(e, r, h))}
      onRemove={() => setEdits((e) => removeRow(e, r))}
      jira={(() => {
        const s = jira.sync(r);
        return s && {
          sync: s,
          limitWarning: s.missing > 0 ? limitText(limitsAfter([{ row: r, minutes: s.missing, comment: "", topUp: false }]), t.submit.limits) : undefined,
          action: jira.actions[rowId(r)],
          onSubmit: () => void jira.submit(r, comment(r)),
          onOverwrite: () => void jira.overwrite(r, comment(r)),
        };
      })()}
    />
  );

  return (
    <Card className="step">
      <StepHeader n={1} title={m.title} tip={m.tip}>
        {m.introBefore}<b>{m.introHours}</b>{m.introAnd}<b>{m.introDesc}</b>{m.introAfter}{jira.load.kind !== "off" && m.introJira}
      </StepHeader>
      {locked && <div className="sync-lock">{t.submit.jira.locked}</div>}
      {/* A disabled fieldset turns off every button and field inside: nothing can be changed or sent while Jira is read. */}
      <fieldset className={`step-body ${locked ? "locked" : ""}`} disabled={locked} aria-busy={locked}>
      <div className="ts-bar">
        <Segmented size="small" value={group} onChange={setGroup}
          options={[{ value: "tasks", label: m.byTask }, { value: "days", label: m.byDay }]} />
        <Segmented size="small" value={fmt} onChange={setFmt}
          options={[{ value: "hm", label: "2h 30m" }, { value: "decimal", label: "2.5" }]} />
        <InfoTip>{m.formatTip}</InfoTip>
        <span className="progress" title={m.progressTitle}>
          <span className="pg-bar"><i style={{ width: `${pct}%` }} /></span>
          <span><b>{doneRows.length}</b>{m.progressRows(rows.length)}<b>{fmtH(sumHours(doneRows))}</b>{m.progressOf(fmtH(sumHours(rows)))}&nbsp;{t.common.h}</span>
        </span>
        <span className="spacer" />
        {doneRows.length > 0 && <Button variant="ghost" size="small" title={m.resetTitle} onClick={() => setDone({})}>{m.reset}</Button>}
        {editCount(edits) > 0 && <Button variant="ghost" size="small" title={m.resetEditsTitle} onClick={() => setEdits(NO_EDITS)}>{m.resetEdits}</Button>}
        <Button size="small" title={m.addRowTitle} disabled={adding} onClick={() => setAdding(true)}>{m.addRow}</Button>
      </div>

      <LimitWarnings r={planLimits} />
      {jira.load.kind !== "off" && jiraBar}
      {adding && <AddRow a={a} rows={rows} onAdd={(r) => setEdits((e) => ({ ...e, added: [...e.added, r] }))} onClose={() => setAdding(false)} />}
      {removed.length > 0 && (
        <details className="unplanned removed">
          <summary>{m.removed(count(removed.length, m.rows))}</summary>
          <div className="bulk-list">
            {removed.map((r) => (
              <div key={rowId(r)} className="bulk-row">
                <span />
                <span className="nw">{weekdayShort(isoWeekday(r.date))} {dateShort(r.date)}</span>
                <span className="nw"><span className="dot" style={{ background: keyColor(r.key) }} /> <IssueLink k={r.key} /></span>
                <b className="nw">{fmtH(r.hours)}</b>
                <span className="bulk-desc"><Button size="small" variant="ghost" onClick={() => setEdits((e) => restoreRow(e, rowId(r)))}>{m.restore}</Button> {r.comment}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {jira.load.kind === "ok" && <Unplanned list={extra} />}
      {reviewing && (
        <BulkReview a={a} plan={plan()} limits={limitsAfter} onConfirm={jira.submitMany} onClose={() => { setReviewing(false); void jira.reload(); }} />
      )}

      <div className="wl-grid">
        {group === "tasks"
          ? byTask.map(([key, rs]) => {
              const d = rs.filter(isDone).length;
              return (
                <article className="wl-card" key={key}>
                  <header>
                    <span className="dot" style={{ background: keyColor(key) }} />
                    <b className="wl-key"><IssueLink k={key} /></b>
                    <span className="wl-ttl" title={a.issues[key]?.summary}>{a.issues[key]?.summary}</span>
                    <span className="spacer" />
                    <span className="wl-sum">{fmtH(sumHours(rs))}&nbsp;<small>{t.common.h}</small></span>
                    <span className={`wl-cnt ${d === rs.length ? "ok" : ""}`} title={m.countTitle}>{d}/{rs.length}</span>
                  </header>
                  {rs.map((r) => line(r, "date"))}
                </article>
              );
            })
          : byDay.map(([date, rs]) => (
              <article className="wl-card" key={date}>
                <header>
                  <b className="nw">{weekdayShort(isoWeekday(date))}, {dateFull(date)}</b>
                  <span className="spacer" />
                  <DayMatchChip d={jira.load.kind === "ok" ? days.get(date) : undefined} />
                  <span className="wl-sum">{fmtH(sumHours(rs))}&nbsp;<small>{t.common.h}</small></span>
                </header>
                {rs.map((r) => line(r, "task"))}
              </article>
            ))}
      </div>
      </fieldset>
    </Card>
  );
}
