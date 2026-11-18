import { dateShort, useT } from "@/i18n";
import type { DashIssue, DashPerson } from "@/shared/types";
import { keyColor } from "@/shared/ui";
import { flagsOf, stageOf } from "../lib/stages";

type M = ReturnType<typeof useT>["dashboard"];

export function ago(ms: number | null, m: M, now = Date.now()): string {
  if (!ms) return "";
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return m.ago.now;
  if (min < 60) return m.ago.min(min);
  if (min < 48 * 60) return m.ago.hours(Math.round(min / 60));
  return m.ago.days(Math.round(min / 1440));
}

export function Who({ p, m }: { p: DashPerson | null; m: M }) {
  if (!p) return <span className="dash-who none">{m.nobody}</span>;
  return <span className={`dash-who ${p.me ? "me" : ""}`}>{p.display}{p.me && <small> · {m.you}</small>}</span>;
}

/** One task on the board: status, flags, assignee and the user's roles; a click opens it in the side panel. */
export function IssueCard({ i, today, now, onOpen }: { i: DashIssue; today: string; now: number; onOpen: (key: string) => void }) {
  const m = useT().dashboard;
  const stage = stageOf(i);
  const flags = flagsOf(i, today, now);
  return (
    <button className={`dash-card s-${stage} ${flags.includes("overdue") ? "late" : ""}`} title={m.openTitle} onClick={() => onOpen(i.key)}>
      <span className="dash-card-h">
        <span className="dot" style={{ background: keyColor(i.key) }} />
        <b className="nw">{i.key}</b>
        <span className="muted dash-type">{i.issueType}</span>
        <span className={`dash-stage s-${stage}`}>{i.status}</span>
        <span className="spacer" />
        {flags.map((f) => <span key={f} className={`dash-flag f-${f}`}>{m.flags[f]}</span>)}
      </span>
      <span className="dash-sum">{i.summary}</span>
      <span className="dash-meta">
        <span title={m.assignee}><Who p={i.assignee} m={m} /></span>
        {/* Only the roles the user holds: the full list is in the task panel. */}
        {i.people.filter((p) => p.person.me).map((p) => (
          <span key={p.field} className="dash-role">{p.field}: {m.you}</span>
        ))}
        <span className="spacer" />
        {i.due && <span className={`dash-due ${flags.includes("overdue") ? "late" : ""}`}>{flags.includes("overdue") ? m.overdue(dateShort(i.due)) : m.due(dateShort(i.due))}</span>}
        <span className="muted" title={m.updatedTitle}>{ago(stage === "done" ? i.resolved : i.updated, m, now)}</span>
      </span>
    </button>
  );
}
