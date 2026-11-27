import { api } from "@/shared/api";
import { count } from "@/i18n";
import type { LocalCall, Meeting } from "@/shared/types";
import { msg } from "../analysis/format";
import { isCounted } from "../plan/calls";
import { fmtMinutes } from "../report/report";
import type { SourceCollector } from "./types";

const m = () => msg().sources.calls;

/** Local midnight of a `yyyy-mm-dd` date, epoch ms. */
const dayStart = (d: string): number => new Date(`${d}T00:00:00`).getTime();

/** Shorter leftovers around a calendar call are joining early or leaving late, not another call. */
const MIN_EXTRA_MS = 3 * 60_000;

type Span = [from: number, to: number];

/** The parts of `span` that none of `taken` covers. */
function uncovered(span: Span, taken: Span[]): Span[] {
  return taken.reduce<Span[]>(
    (parts, [from, to]) =>
      parts.flatMap(([a, b]): Span[] => {
        if (to <= a || from >= b) return [[a, b]];
        const left: Span[] = [[a, from], [to, b]];
        return left.filter(([x, y]) => y > x);
      }),
    [span],
  );
}

/**
 * Calls noted on this computer as meetings. The calendar comes first: the computer only adds the time
 * no counted calendar call covers (a call that is not in the calendar, or one that ran over), and no
 * minute is counted twice. `duplicates` are calls that add nothing.
 */
export function toMeetings(calls: LocalCall[], calendar: Meeting[], untitled: (app: string) => string): { meetings: Meeting[]; duplicates: number } {
  const taken: Span[] = calendar.filter(isCounted).map((x) => [x.ts, x.endTs]);
  const meetings: Meeting[] = [];
  let duplicates = 0;
  for (const c of calls) {
    if (c.hidden) continue;
    const parts = uncovered([c.started, c.ended], taken).filter(
      ([a, b]) => (a === c.started && b === c.ended) || b - a >= MIN_EXTRA_MS,
    );
    if (!parts.length) duplicates += 1;
    for (const [ts, endTs] of parts) {
      meetings.push({
        ts, endTs, minutes: Math.max(1, Math.round((endTs - ts) / 60_000)),
        title: c.title || untitled(c.app), organizer: "", location: "", isCall: true, tentative: false, localId: c.id,
      });
    }
    taken.push([c.started, c.ended]);
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
    ctx.meetings = ctx.meetings.concat(meetings).sort((a, b) => a.ts - b.ts);
  },
};
