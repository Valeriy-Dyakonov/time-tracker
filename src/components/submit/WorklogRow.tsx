import type { Analysis } from "../../types";
import { formatRu, weekdayName } from "../../lib/dates";
import { fmtTempo, type HoursFormat, type WorklogRow as Row } from "../../lib/submit";
import IssueLink from "../IssueLink";
import { CopyChip, CopyIcon, keyColor } from "../ui";

/** "By task" groups rows under a task, so each row shows its date; "by day" is the other way round. */
export type RowLabel = "date" | "task";

const Estimated = () => (
  <span className="est" title="День без данных: часы взяты по соседним дням, описание типовое. Проверьте перед списанием.">≈</span>
);

export function WorklogRow(props: {
  a: Analysis;
  row: Row;
  label: RowLabel;
  fmt: HoursFormat;
  done: boolean;
  comment: string;
  onToggle: () => void;
  onComment: (text: string) => void;
}) {
  const { a, row: r, done } = props;
  return (
    <div className={`wl-row ${props.label === "task" ? "by-key" : "by-date"} ${done ? "done" : ""}`}>
      <button className={`wl-check ${done ? "on" : ""}`} aria-pressed={done} onClick={props.onToggle}
        title={done ? "Отмечено как внесённое — снять отметку" : "Отметить, что внёс в Tempo"}>
        <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
      </button>
      {props.label === "task" ? (
        <span className="wl-what">
          <span className="dot" style={{ background: keyColor(r.key) }} /><IssueLink k={r.key} />
          <span className="muted wl-title">{a.issues[r.key]?.summary}</span>{r.inferred && <Estimated />}
        </span>
      ) : (
        <span className="wl-what"><b className="nw">{weekdayName(r.date)}&nbsp;{formatRu(r.date).slice(0, 5)}</b>{r.inferred && <Estimated />}</span>
      )}
      <CopyChip text={fmtTempo(r.hours, props.fmt)} title="Скопировать часы для поля Time Spent" />
      <span className="wl-desc">
        <textarea rows={1} value={props.comment} onChange={(e) => props.onComment(e.target.value)} placeholder="Описание работы" title="Текст для поля Description в Tempo — можно поправить" />
        <CopyIcon text={props.comment} title="Скопировать описание" />
      </span>
    </div>
  );
}
