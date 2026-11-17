import type { DayPlan } from "../types";
import { fmtMinutes, meetingMinutes, meetingRange } from "../lib/report";

/** Calls and meetings of a day, marked separately from the task hours. */
export default function Meetings({ d }: { d: DayPlan }) {
  if (d.off || d.meetings.length === 0) return null;
  const calls = d.meetings.filter((m) => m.isCall).length;
  return (
    <div className="meetings">
      <span className="mt-head">
        📞 Звонки и встречи: {d.meetings.length} · {fmtMinutes(meetingMinutes(d))}
        {calls > 0 && calls !== d.meetings.length ? ` (звонков: ${calls})` : ""}
      </span>
      <span className="mt-chips">
        {d.meetings.map((m, i) => (
          <span
            key={i}
            className={`mt-chip ${m.isCall ? "call" : ""} ${m.tentative ? "tent" : ""}`}
            title={`${m.title}\n${meetingRange(m)} · ${m.minutes} мин${m.organizer ? "\nОрганизатор: " + m.organizer : ""}${m.location ? "\n" + m.location : ""}`}
          >
            <b>{meetingRange(m)}</b> {m.title}
          </span>
        ))}
      </span>
    </div>
  );
}
