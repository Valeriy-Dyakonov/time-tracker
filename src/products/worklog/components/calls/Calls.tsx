import { useEffect, useState } from "react";
import { api } from "@/shared/api";
import { appName, groupByDay } from "@/shared/lib/callApps";
import { localDate, weekdayName } from "@/shared/lib/dates";
import { dateShort, useT } from "@/i18n";
import type { LocalCall } from "@/shared/types";
import { Button, Card, Switch } from "@/shared/ui";
import { NextStep } from "../report/Flow";
import { fmtMinutes } from "../../lib/report/report";

const DAY_MS = 86_400_000;
const dayStart = (d: string) => new Date(`${d}T00:00:00`).getTime();
const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5);
const minutes = (c: LocalCall) => Math.round((c.ended - c.started) / 60_000);

/** Step 1: the calls noted on this computer in the chosen period; the user switches off the ones that were not work. */
export default function Calls({ start, end, tracking, onOpenSettings, onChanged, onNext }: {
  start: string;
  end: string;
  tracking: boolean;
  onOpenSettings: () => void;
  /** The user switched a call: a result computed before no longer matches. */
  onChanged: () => void;
  onNext: () => void;
}) {
  const t = useT().report.calls;
  const [calls, setCalls] = useState<LocalCall[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tracking) return;
    api.callsList(dayStart(start), dayStart(end) + DAY_MS, true).then(setCalls).catch((e) => setError(t.loadFailed(String(e))));
  }, [start, end, tracking, t]);

  async function toggle(c: LocalCall, work: boolean) {
    setError("");
    try {
      await api.callsSetHidden(c.id, !work);
    } catch (e) {
      setError(t.loadFailed(String(e)));
      return;
    }
    setCalls((cur) => cur && cur.map((x) => (x.id === c.id ? { ...x, hidden: !work } : x)));
    onChanged();
  }

  if (!tracking) {
    return (
      <Card>
        <p className="calls-note">{t.off}</p>
        <div className="row">
          <Button size="small" onClick={onOpenSettings}>{t.openSettings}</Button>
          <Button size="small" variant="primary" onClick={onNext}>{t.skip}</Button>
        </div>
      </Card>
    );
  }

  const workMin = (calls ?? []).filter((c) => !c.hidden).reduce((s, c) => s + minutes(c), 0);
  const skipped = (calls ?? []).filter((c) => c.hidden).length;
  return (
    <>
      <Card>
        <p className="calls-note">{t.intro(`${dateShort(start)} – ${dateShort(end)}`)}</p>
        {error && <p className="status err">{error}</p>}
        {calls && calls.length === 0 && <p className="hint">{t.empty}</p>}
        {calls && calls.length > 0 && (
          <>
            <div className="calls-sum">{t.summary(fmtMinutes(workMin), skipped)}</div>
            <div className="call-days">
              {groupByDay(calls, (ms) => localDate(new Date(ms))).map(({ day, calls: list }) => {
                const work = list.filter((c) => !c.hidden).reduce((s, c) => s + minutes(c), 0);
                return (
                  <section key={day} className="call-day">
                    <h5>{weekdayName(day)}, {dateShort(day)}<span>{t.workTotal(fmtMinutes(work))}</span></h5>
                    <ul className="call-list">
                      {list.map((c) => (
                        <li key={c.id} className={c.hidden ? "off" : ""}>
                          <Switch checked={!c.hidden} onChange={(v) => toggle(c, v)} title={c.hidden ? t.notWork : t.work}>{""}</Switch>
                          <b>{t.range(hhmm(c.started), hhmm(c.ended))}</b>
                          <span className="call-title">{c.title || t.untitled}<em className="call-app">{appName(c.app)}</em></span>
                          <span className="call-min">{fmtMinutes(minutes(c))}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </Card>
      <NextStep to="analysis" onGo={onNext} />
    </>
  );
}
