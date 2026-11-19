import { api } from "@/shared/api";
import { count } from "@/i18n";
import type { LocalCall, Meeting } from "@/shared/types";
import { msg } from "../analysis/format";
import { fmtMinutes } from "../report/report";
import type { SourceCollector } from "./types";

const m = () => msg().sources.calls;

/** Local midnight of a `yyyy-mm-dd` date, epoch ms. */
const dayStart = (d: string): number => new Date(`${d}T00:00:00`).getTime();

const overlaps = (a: { ts: number; endTs: number }, b: { ts: number; endTs: number }): boolean => a.ts < b.endTs && b.ts < a.endTs;

/**
 * Calls noted on this computer as meetings. A call that is already a calendar call is left out: the
 * calendar entry has the real title and organizer, so the same hour is not counted twice.
 */
export function toMeetings(calls: LocalCall[], calendar: Meeting[], untitled: (app: string) => string): { meetings: Meeting[]; duplicates: number } {
  const known = calendar.filter((x) => x.isCall);
  const meetings: Meeting[] = [];
  let duplicates = 0;
  for (const c of calls) {
    if (c.hidden) continue;
    const meeting: Meeting = {
      ts: c.started, endTs: c.ended, minutes: Math.max(1, Math.round((c.ended - c.started) / 60_000)),
      title: c.title || untitled(c.app), organizer: "", location: "", isCall: true, tentative: false, localId: c.id,
    };
    if (known.some((k) => overlaps(k, meeting))) duplicates += 1;
    else meetings.push(meeting);
  }
  return { meetings, duplicates };
}

export const callsSource: SourceCollector = {
  get name() { return m().name; },
  get step() { return m().step; },
  get skipped() { return m().skipped; },
  enabled: ({ o, settings }) => o.useCalls && settings.trackCalls,
  async collect(ctx) {
    ctx.log("info", m().reading);
    const from = dayStart(ctx.range.start);
    const to = dayStart(ctx.range.end) + 86_400_000;
    const calls = await api.callsList(from, to, false);
    const { meetings, duplicates } = toMeetings(calls, ctx.meetings, m().untitled);
    ctx.log("ok", m().done(meetings.length, fmtMinutes(meetings.reduce((s, x) => s + x.minutes, 0)), duplicates));
    ctx.meetings = ctx.meetings.concat(meetings);
  },
};
