import { api } from "@/shared/api";
import { count } from "@/i18n";
import type { Evt, Meeting } from "@/shared/types";
import { msg } from "../analysis/format";
import { fmtMinutes, meetingRange } from "../report/report";
import type { SourceCollector } from "./types";

const m = () => msg().sources.calendar;

const toEvent = (x: Meeting): Evt => ({
  source: "calendar",
  ts: x.ts,
  issueKey: null,
  text: x.title,
  context: m().eventContext(meetingRange(x), x.minutes, x.isCall, x.organizer ?? ""),
  weight: x.minutes,
});

export const calendarSource: SourceCollector = {
  get name() { return m().name; },
  get step() { return m().step; },
  get skipped() { return m().skipped; },
  enabled: ({ o, settings }) => o.useCalendar && !!settings.exchangeUrl,
  async collect(ctx) {
    ctx.log("info", m().reading(ctx.settings.calendarOnlyCalls));
    const meetings = await api.fetchCalendar(ctx.range.start, ctx.range.end);
    ctx.meetings = meetings;
    const calls = meetings.filter((x) => x.isCall).length;
    ctx.log("ok", m().done(count(meetings.length, m().meetings), calls, fmtMinutes(meetings.reduce((s, x) => s + x.minutes, 0))));
    ctx.events = ctx.events.concat(meetings.map(toEvent));
  },
};
