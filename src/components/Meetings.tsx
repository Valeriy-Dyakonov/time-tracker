import type { DayPlan } from "../types";
import { fmtMinutes, meetingMinutes, meetingRange } from "../lib/report";

/** Calls and meetings of a day, marked separately from the task hours. */
export default function Meetings({ d }: { d: DayPlan }) {
  if (d.off || d.meetings.length === 0) return null;
  const calls = d.meetings.filter((m) => m.isCall).length;
  return (
    <div className="meetings">
      <span className="mt-head">
        Звонки и встречи: {d.meetings.length} · {fmtMinutes(meetingMinutes(d))}
        {calls > 0 && calls !== d.meetings.length ? ` (звонков: ${calls})` : ""}
      </span>
      <ul className="mt-list">
        {d.meetings.map((m, i) => (
          <li key={i} className={`${m.isCall ? "call" : ""} ${m.tentative ? "tent" : ""}`} title={`${m.organizer ? "Организатор: " + m.organizer : ""}${m.location ? "\n" + m.location : ""}`}>
            <b>{meetingRange(m)}</b>
            <span className="mt-title">{m.isCall && <i className="mt-call">звонок</i>}{m.title}</span>
            <span className="mt-min">{fmtMinutes(m.minutes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
