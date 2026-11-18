import type { Analysis } from "@/shared/types";
import { isoWeekday } from "@/shared/lib/dates";
import { dateShort, useT, weekdayShort } from "@/i18n";
import type { HoursFormat } from "../../../lib/submit/rows";
import type { EditedRow as Row } from "../../../lib/submit/edits";
import IssueLink from "@/shared/components/IssueLink";
import { CopyIcon, keyColor } from "@/shared/ui";
import { HoursField } from "./HoursField";
import { JiraLine } from "./JiraLine";

/** "By task" groups rows under a task, so each row shows its date; "by day" is the other way round. */
export type RowLabel = "date" | "task";

const Estimated = ({ title }: { title: string }) => <span className="est" title={title}>≈</span>;

export function WorklogRow(props: {
  a: Analysis;
  row: Row;
  label: RowLabel;
  fmt: HoursFormat;
  done: boolean;
  comment: string;
  onToggle: () => void;
  onComment: (text: string) => void;
  onHours: (hours: number) => void;
  onRemove: () => void;
  /** Present when the period's worklogs were read from Jira. */
  jira?: Omit<Parameters<typeof JiraLine>[0], "comment">;
}) {
  const { a, row: r, done } = props;
  const m = useT().submit.row;
  return (
    <div className={`wl-row ${props.label === "task" ? "by-key" : "by-date"} ${done ? "done" : ""}`}>
      <button className={`wl-check ${done ? "on" : ""}`} aria-pressed={done} onClick={props.onToggle}
        title={done ? m.unmarkDone : m.markDone}>
        <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
      </button>
      {props.label === "task" ? (
        <span className="wl-what">
          <span className="dot" style={{ background: keyColor(r.key) }} /><IssueLink k={r.key} />
          <span className="muted wl-title">{a.issues[r.key]?.summary}</span>{r.inferred && <Estimated title={m.estimated} />}
        </span>
      ) : (
        <span className="wl-what"><b className="nw">{weekdayShort(isoWeekday(r.date))}&nbsp;{dateShort(r.date)}</b>{r.inferred && <Estimated title={m.estimated} />}</span>
      )}
      <span className="wl-tools">
        {r.origin === "added" && <span className="wl-added" title={m.addedTitle}>{m.added}</span>}
        <HoursField hours={r.hours} planHours={r.planHours} fmt={props.fmt} onChange={props.onHours} />
        <button className="wl-mini wl-del" title={m.remove} onClick={props.onRemove}>×</button>
      </span>
      <span className="wl-desc">
        <textarea rows={1} value={props.comment} onChange={(e) => props.onComment(e.target.value)} placeholder={m.descPlaceholder} title={m.descTitle} />
        <CopyIcon text={props.comment} title={m.copyDesc} />
      </span>
      {props.jira && <JiraLine {...props.jira} comment={props.comment} />}
    </div>
  );
}
