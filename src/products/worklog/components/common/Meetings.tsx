import type { DayPlan } from "@/shared/types";
import { useT } from "@/i18n";
import { fmtMinutes, meetingMinutes, meetingRange } from "../../lib/report/report";

/** Calls and meetings of a day, marked separately from the task hours. */
export default function Meetings({ d }: { d: DayPlan }) {
  const t = useT().shell.meetings;
  if (d.off || d.meetings.length === 0) return null;
  const calls = d.meetings.filter((m) => m.isCall).length;
  return (
    <div className="meetings">
      <h6 className="mt-head">
        <i />{t.title}
        <span>{d.meetings.length} · {fmtMinutes(meetingMinutes(d))}{calls > 0 && calls !== d.meetings.length ? t.calls(calls) : ""}</span>
      </h6>
      <ul className="mt-list">
        {d.meetings.map((m, i) => (
          <li key={i} className={`${m.isCall ? "call" : ""} ${m.tentative ? "tent" : ""}`} title={`${m.organizer ? t.organizer(m.organizer) : ""}${m.location ? "\n" + m.location : ""}`}>
            <b>{meetingRange(m)}</b>
            <span className="mt-title">{m.isCall && <i className="mt-call">{t.call}</i>}{m.title}</span>
            <span className="mt-min">{fmtMinutes(m.minutes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
