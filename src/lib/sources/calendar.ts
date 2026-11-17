import { api } from "../../api";
import type { Evt, Meeting } from "../../types";
import { plural } from "../dates";
import { fmtMinutes, meetingRange } from "../report";
import type { SourceCollector } from "./types";

const toEvent = (m: Meeting): Evt => ({
  source: "calendar",
  ts: m.ts,
  issueKey: null,
  text: m.title,
  context: `${meetingRange(m)}, ${m.minutes} мин${m.isCall ? " · звонок" : ""}${m.organizer ? " · организатор " + m.organizer : ""}`,
  weight: m.minutes,
});

export const calendarSource: SourceCollector = {
  name: "Календарь",
  step: "календарь: встречи и звонки",
  skipped: "Календарь: пропущен (не настроен или выключен).",
  enabled: ({ o, settings }) => o.useCalendar && !!settings.exchangeUrl,
  async collect(ctx) {
    ctx.log("info", `Календарь (Exchange): читаю встречи и звонки${ctx.settings.calendarOnlyCalls ? " (только звонки)" : ""}…`);
    const meetings = await api.fetchCalendar(ctx.o.start, ctx.o.end);
    ctx.meetings = meetings;
    const calls = meetings.filter((m) => m.isCall).length;
    ctx.log("ok", `Календарь: ${meetings.length} ${plural(meetings.length, "встреча", "встречи", "встреч")}, из них похожих на звонки ${calls}; всего ${fmtMinutes(meetings.reduce((s, m) => s + m.minutes, 0))}. Отменённые, отклонённые и «свободные» пропущены.`);
    ctx.events = ctx.events.concat(meetings.map(toEvent));
  },
};
