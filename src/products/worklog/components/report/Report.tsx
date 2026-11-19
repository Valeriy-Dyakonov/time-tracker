import { useState } from "react";
import { dateShort, useT } from "@/i18n";
import { useStored } from "@/shared/hooks/useStored";
import type { Analysis, DayPlan, DayProgress, LogEntry, Settings } from "@/shared/types";
import { monthRange } from "@/shared/lib/dates";
import { runAnalysis } from "../../lib/analysis/pipeline";
import type { SetupState } from "@/shared/lib/setup";
import { Hours } from "../hours/Hours";
import { Stats } from "../hours/Stats";
import { LivePanel, LogList, logText } from "./Live";
import AiReview from "../review/AiReview";
import Calls from "../calls/Calls";
import Submit from "../submit/Submit";
import { Button, Card, CopyButton, Title } from "@/shared/ui";
import { allSourcesOn, sourceFlags } from "./analysisSources";
import { Export } from "./Export";
import { PeriodBar, RunPanel, type FilterValues } from "./Filters";
import { Flow, NextStep, type View } from "./Flow";
import { staleReason, type Stale } from "./stale";

type Live = { days: DayProgress[]; log: LogEntry[] };

export default function Report(props: {
  settings: Settings;
  setup: SetupState;
  onOpenSettings: () => void;
  analysis: Analysis | null;
  onChange: (a: Analysis | null) => void;
}) {
  const t = useT().report;
  const { settings, setup, analysis: a } = props;
  // The fields start from the result on screen, so the period and the data never disagree after a restart.
  const [filters, setFilters] = useState<FilterValues>(() => ({
    ...(a ? { start: a.start, end: a.end } : monthRange(0)),
    hours: a?.hoursPerDay ?? settings.hoursPerDay,
    fillMode: a?.fillMode ?? "neighbors",
    sources: allSourcesOn(),
  }));
  const [callsChanged, setCallsChanged] = useStored("worklog.callsChanged", false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>(settings.trackCalls ? "calls" : "analysis");
  const [onlyReview, setOnlyReview] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    setLive({ days: [], log: [] });
    try {
      const res = await runAnalysis(
        settings,
        {
          start: filters.start,
          end: filters.end,
          hoursPerDay: filters.hours,
          fillMode: filters.fillMode,
          useJira: true,
          ...sourceFlags(filters.sources, setup),
        },
        {
          onLog: (e) => setLive((l) => (l ? { ...l, log: [...l.log, e] } : l)),
          onDays: (d) => setLive((l) => (l ? { ...l, days: d } : l)),
        },
      );
      props.onChange(res);
      setCallsChanged(false);
      setView("analysis");
      setLive(null);
    } catch (e) {
      setError(String(e)); // the live panel stays on screen so the log can be read
    } finally {
      setBusy(false);
    }
  }

  function updateDay(date: string, fn: (d: DayPlan) => DayPlan) {
    if (!a) return;
    props.onChange({ ...a, days: a.days.map((d) => (d.date === date ? fn(d) : d)) });
  }

  const showLive = !!live && (busy || !!error);
  const stale = staleReason(a, filters, callsChanged);

  return (
    <div>
      <PeriodBar value={filters} onChange={setFilters} />
      <Flow view={view} onChange={setView} stale={stale} hasResult={!!a} />

      {view === "calls" && (
        <Calls start={filters.start} end={filters.end} tracking={settings.trackCalls} onOpenSettings={props.onOpenSettings}
          onChanged={() => setCallsChanged(true)} onNext={() => setView("analysis")} />
      )}

      {view === "analysis" && (
        <>
          <RunPanel value={filters} onChange={setFilters} setup={setup} busy={busy} error={error} onRun={run} onOpenSettings={props.onOpenSettings} />
          {showLive && <LivePanel days={live!.days} log={live!.log} running={busy} />}
          {!showLive && a && stale && <StaleNote stale={stale} a={a} />}
          {!showLive && a && !stale && (
            <>
              <p className="result-for">{t.resultFor(`${dateShort(a.start)} – ${dateShort(a.end)}`)}</p>
              <Stats a={a} onReview={() => setOnlyReview(true)} />
              {a.warnings.length > 0 && (
                <details className="warnings" open={a.warnings.length < 4}>
                  <summary>{t.warnings(a.warnings.length)}</summary>
                  <ul>{a.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  <p className="hint">{t.warningsHint}</p>
                </details>
              )}
              <NextStep to="submit" onGo={() => setView("submit")} />
              <Hours a={a} updateDay={updateDay} onlyReview={onlyReview} setOnlyReview={setOnlyReview} onAi={() => setView("ai")} />
              <NextStep to="submit" onGo={() => setView("submit")} />
            </>
          )}
          {!showLive && !a && !busy && <Welcome ready={setup.jira} onOpenSettings={props.onOpenSettings} />}
        </>
      )}

      {view !== "calls" && view !== "analysis" && (
        !a ? (
          <Card className="banner">
            <p className="muted">{t.noResult}</p>
            <div className="row"><Button variant="primary" onClick={() => setView("analysis")}>{t.toAnalysis}</Button></div>
          </Card>
        ) : stale ? (
          <StaleNote stale={stale} a={a} onGo={() => setView("analysis")} />
        ) : (
          <>
            <p className="result-for">{t.resultFor(`${dateShort(a.start)} – ${dateShort(a.end)}`)}</p>
            {view === "submit" && <Submit a={a} canAi={setup.llm} />}
            {view === "ai" && <AiReview a={a} />}
            {view === "log" && (
              <Card>
                <div className="row">
                  <Title tip={t.log.tip}>{t.log.title}</Title>
                  <span className="spacer" />
                  <CopyButton label={t.log.copy} text={() => logText(a.log)} />
                </div>
                <LogList entries={a.log} />
              </Card>
            )}
            {view === "export" && <Export a={a} />}
          </>
        )
      )}
    </div>
  );
}

/** The result belongs to other settings than the ones chosen: it is not shown as current. */
function StaleNote({ stale, a, onGo }: { stale: NonNullable<Stale>; a: Analysis; onGo?: () => void }) {
  const t = useT().report.stale;
  return (
    <Card className="banner stale-note">
      <h3>{t.title}</h3>
      <p className="muted">{stale === "period" ? t.period(`${dateShort(a.start)} – ${dateShort(a.end)}`) : t.calls}</p>
      {onGo && <div className="row"><Button variant="primary" onClick={onGo}>{t.go}</Button></div>}
    </Card>
  );
}

function Welcome({ ready, onOpenSettings }: { ready: boolean; onOpenSettings: () => void }) {
  const t = useT().report.welcome;
  return (
    <Card className="banner">
      {ready ? (
        <>
          <h3>{t.readyTitle}</h3>
          <p className="muted">{t.readyText}</p>
        </>
      ) : (
        <>
          <h3>{t.title}</h3>
          <p className="muted">{t.text}</p>
          <div className="row"><Button variant="primary" onClick={onOpenSettings}>{t.openSettings}</Button></div>
        </>
      )}
    </Card>
  );
}
