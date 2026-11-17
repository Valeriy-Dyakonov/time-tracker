import { useMemo, useState } from "react";
import type { Analysis } from "../../types";
import { formatRu, weekdayName } from "../../lib/dates";
import { fmtH } from "../../lib/report";
import { rowId, worklogRows, type HoursFormat, type WorklogRow as Row } from "../../lib/submit";
import { useStored } from "../hooks/useStored";
import IssueLink from "../IssueLink";
import { InfoTip, keyColor } from "../ui";
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
    <section className="card step">
      <StepHeader n={1} title="Tempo в Jira — часы по задачам"
        tip="Tempo — плагин Jira для учёта времени. Каждая строка ниже — одна запись «Log work»: задача, дата, часы и описание. Отметки и правки описаний сохраняются, можно вернуться позже.">
        Нажмите на ключ задачи — она откроется в браузере. В Tempo нажмите «Log work» и для каждой строки скопируйте <b>часы</b> и <b>описание</b>
        (клик по значку ⧉), выберите дату и сохраните. Потом поставьте галочку — так не потеряете, где остановились.
      </StepHeader>
      <div className="ts-bar">
        <div className="seg small">
          <button className={group === "tasks" ? "on" : ""} onClick={() => setGroup("tasks")}>По задачам</button>
          <button className={group === "days" ? "on" : ""} onClick={() => setGroup("days")}>По дням</button>
        </div>
        <div className="seg small">
          <button className={fmt === "hm" ? "on" : ""} onClick={() => setFmt("hm")}>2h 30m</button>
          <button className={fmt === "decimal" ? "on" : ""} onClick={() => setFmt("decimal")}>2.5</button>
        </div>
        <InfoTip>В каком виде копировать часы. Tempo принимает оба, но в некоторых настройках понимает только один — выберите тот, что у вас срабатывает.</InfoTip>
        <span className="progress" title="Сколько строк вы уже отметили как внесённые">
          <span className="pg-bar"><i style={{ width: `${pct}%` }} /></span>
          <span><b>{doneRows.length}</b> из {rows.length} строк · <b>{fmtH(sumHours(doneRows))}</b> из {fmtH(sumHours(rows))}&nbsp;ч</span>
        </span>
        <span className="spacer" />
        {doneRows.length > 0 && <button className="btn small ghost" title="Снять все галочки «внесено» за этот период" onClick={() => setDone({})}>Сбросить отметки</button>}
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
                    <span className="wl-sum">{fmtH(sumHours(rs))}&nbsp;<small>ч</small></span>
                    <span className={`wl-cnt ${d === rs.length ? "ok" : ""}`} title="Внесено строк из всех по задаче">{d}/{rs.length}</span>
                  </header>
                  {rs.map((r) => line(r, "date"))}
                </article>
              );
            })
          : byDay.map(([date, rs]) => (
              <article className="wl-card" key={date}>
                <header>
                  <b className="nw">{weekdayName(date)}, {formatRu(date)}</b>
                  <span className="spacer" />
                  <span className="wl-sum">{fmtH(sumHours(rs))}&nbsp;<small>ч</small></span>
                </header>
                {rs.map((r) => line(r, "task"))}
              </article>
            ))}
      </div>
    </section>
  );
}
