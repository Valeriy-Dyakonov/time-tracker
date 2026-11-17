import { useMemo, useState } from "react";
import type { Analysis } from "../../types";
import { isoWeekday } from "../../lib/dates";
import { dateFull, useT, weekdayShort } from "../../i18n";
import { fmtH } from "../../lib/report";
import { rowId, worklogRows, type HoursFormat, type WorklogRow as Row } from "../../lib/submit";
import { useStored } from "../hooks/useStored";
import IssueLink from "../IssueLink";
import { Button, Card, InfoTip, keyColor, Segmented } from "../ui";
import { StepHeader } from "./StepHeader";
import { WorklogRow, type RowLabel } from "./WorklogRow";

type Group = "tasks" | "days";

const sumHours = (rs: Row[]) => rs.reduce((s, r) => s + r.hours, 0);

function groupBy(rows: Row[], key: (r: Row) => string): [string, Row[]][] {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return [...m.entries()];
}

/** Step 1: copy hours and descriptions into Tempo row by row, ticking off what is done. */
export function TempoStep({ a, storeId }: { a: Analysis; storeId: string }) {
  const [done, setDone] = useStored<Record<string, boolean>>(`${storeId}.done`, {});
  const [comments, setComments] = useStored<Record<string, string>>(`${storeId}.comments`, {});
  const [fmt, setFmt] = useStored<HoursFormat>("worklog.submit.fmt", "hm");
  const [group, setGroup] = useState<Group>("tasks");
  const t = useT();
  const m = t.submit.tempo;

  const rows = useMemo(() => worklogRows(a), [a]);
  const byTask = useMemo(() => groupBy(rows, (r) => r.key).sort((x, y) => sumHours(y[1]) - sumHours(x[1])), [rows]);
  const byDay = useMemo(() => groupBy(rows, (r) => r.date).sort((x, y) => x[0].localeCompare(y[0])), [rows]);
  const doneRows = rows.filter((r) => done[rowId(r)]);
  const pct = rows.length ? (doneRows.length / rows.length) * 100 : 0;

  const line = (r: Row, label: RowLabel) => (
    <WorklogRow
      key={rowId(r)}
      a={a}
      row={r}
      label={label}
      fmt={fmt}
      done={!!done[rowId(r)]}
      comment={comments[rowId(r)] ?? r.comment}
      onToggle={() => setDone((p) => ({ ...p, [rowId(r)]: !p[rowId(r)] }))}
      onComment={(text) => setComments((p) => ({ ...p, [rowId(r)]: text }))}
    />
  );

  return (
    <Card className="step">
      <StepHeader n={1} title={m.title} tip={m.tip}>
        {m.introBefore}<b>{m.introHours}</b>{m.introAnd}<b>{m.introDesc}</b>{m.introAfter}
      </StepHeader>
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
      </div>

      <div className="wl-grid">
        {group === "tasks"
          ? byTask.map(([key, rs]) => {
              const d = rs.filter((r) => done[rowId(r)]).length;
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
                  <span className="wl-sum">{fmtH(sumHours(rs))}&nbsp;<small>{t.common.h}</small></span>
                </header>
                {rs.map((r) => line(r, "task"))}
              </article>
            ))}
      </div>
    </Card>
  );
}
