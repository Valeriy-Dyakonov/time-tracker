import { describe, expect, it } from "vitest";
import type { LocalCall, Meeting } from "@/shared/types";
import { toMeetings } from "./calls";

const min = 60_000;
const t0 = Date.UTC(2026, 0, 12, 10, 0);
const call = (o: Partial<LocalCall>): LocalCall => ({ id: 1, app: "zoom", title: "", started: t0, ended: t0 + 30 * min, hidden: false, ...o });
const cal = (o: Partial<Meeting>): Meeting => ({ ts: t0, endTs: t0 + 30 * min, minutes: 30, title: "Daily", organizer: "", location: "", isCall: true, tentative: false, ...o });
const untitled = (app: string) => `Call (${app})`;

describe("toMeetings", () => {
  it("makes a call meeting that remembers its id and falls back to the program name", () => {
    const { meetings } = toMeetings([call({ id: 7 })], [], untitled);
    expect(meetings).toHaveLength(1);
    expect(meetings[0]).toMatchObject({ localId: 7, title: "Call (zoom)", minutes: 30, isCall: true });
  });

  it("skips calls marked as not work", () => {
    expect(toMeetings([call({ hidden: true })], [], untitled).meetings).toEqual([]);
  });

  it("adds only the time the calendar call does not cover", () => {
    const { meetings } = toMeetings([call({ started: t0 - 2 * min, ended: t0 + 50 * min })], [cal({})], untitled);
    expect(meetings).toMatchObject([{ ts: t0 + 30 * min, endTs: t0 + 50 * min, minutes: 20 }]);
  });

  it("keeps the whole call next to a tentative calendar call, which is not counted", () => {
    expect(toMeetings([call({})], [cal({ tentative: true })], untitled).meetings).toMatchObject([{ minutes: 30 }]);
  });

  it("does not count two programs holding the microphone at once twice", () => {
    const { meetings, duplicates } = toMeetings([call({}), call({ id: 2, app: "chrome", ended: t0 + 20 * min })], [], untitled);
    expect(meetings).toHaveLength(1);
    expect(duplicates).toBe(1);
  });

  it("leaves out a call that is already a calendar call, but not a calendar event that is no call", () => {
    expect(toMeetings([call({})], [cal({})], untitled)).toMatchObject({ meetings: [], duplicates: 1 });
    expect(toMeetings([call({})], [cal({ isCall: false })], untitled).meetings).toHaveLength(1);
    expect(toMeetings([call({ started: t0 + 60 * min, ended: t0 + 90 * min })], [cal({})], untitled).meetings).toHaveLength(1);
  });
});
