import { useT } from "@/i18n";
import type { FillMode } from "@/shared/types";
import { monthRange } from "@/shared/lib/dates";
import type { SetupState } from "@/shared/lib/setup";
import DateRange from "./DateRange";
import { Card, InfoTip, Segmented, Stepper } from "@/shared/ui";
import { ANALYSIS_SOURCES, type SourceToggles } from "./analysisSources";

export interface FilterValues {
  start: string;
  end: string;
  hours: number;
  fillMode: FillMode;
  sources: SourceToggles;
}

const PRESETS = [0, -1] as const;
const activePreset = (start: string, end: string) =>
  PRESETS.map(String).find((o) => { const r = monthRange(Number(o)); return r.start === start && r.end === end; }) ?? null;

const FILLS: FillMode[] = ["neighbors", "period", "none"];

export function Filters(props: {
  value: FilterValues;
  onChange: (v: FilterValues) => void;
  setup: SetupState;
  busy: boolean;
  error: string;
  onRun: () => void;
  onOpenSettings: () => void;
}) {
  const all = useT();
  const t = all.report.filters;
  const presetLabel = { "0": t.thisMonth, "-1": t.lastMonth };
  const v = props.value;
  const patch = (p: Partial<FilterValues>) => props.onChange({ ...v, ...p });

  return (
    <Card className="filters">
      <div className="f-grid">
        <div className="fg">
          <span className="f-label">{t.period}<InfoTip>{t.periodTip}</InfoTip></span>
          <div className="f-ctl">
            <Segmented value={activePreset(v.start, v.end)} onChange={(offset) => patch(monthRange(Number(offset)))}
              options={PRESETS.map((offset) => ({ value: String(offset), label: presetLabel[offset] }))} />
            <DateRange start={v.start} end={v.end} onChange={(start, end) => patch({ start, end })} />
          </div>
        </div>
        <div className="fg">
          <span className="f-label">{t.norm}
            <InfoTip>{t.normTip}</InfoTip>
          </span>
          <div className="f-ctl"><Stepper value={v.hours} step={0.5} min={1} max={24} suffix={all.common.h} onChange={(hours) => patch({ hours })} /></div>
        </div>
        <div className="fg">
          <span className="f-label">{t.emptyDays}
            <InfoTip wide>
              {t.emptyDaysIntro}
              <ul>{FILLS.map((id) => <li key={id}><b>{t.fill[id].label}</b> — {t.fill[id].tip}</li>)}</ul>
              {t.emptyDaysOutro}
            </InfoTip>
          </span>
          <div className="f-ctl">
            <Segmented value={v.fillMode} onChange={(fillMode) => patch({ fillMode })}
              options={FILLS.map((value) => ({ value, label: t.fill[value].label, title: t.fill[value].hint }))} />
          </div>
        </div>
        <div className="fg run-wrap">
          <RunButton busy={props.busy} ready={props.setup.jira} onRun={props.onRun} />
        </div>
      </div>
      <div className="f-src">
        <span className="f-label">{t.sources}
          <InfoTip>{t.sourcesTip}</InfoTip>
        </span>
        <div className="srcpick">
          <button className="srcbtn on locked" title={t.jiraAlways} disabled><span className="dot" />{all.common.sources.jira}</button>
          {ANALYSIS_SOURCES.map((s) => {
            const on = v.sources[s.id];
            const label = all.common.sources[s.label];
            const hint = t.sourceHints[s.id];
            return props.setup[s.setup] ? (
              <button key={s.id} className={`srcbtn ${on ? "on" : ""}`} aria-pressed={on} title={hint} onClick={() => patch({ sources: { ...v.sources, [s.id]: !on } })}>
                <span className="dot" />{label}
              </button>
            ) : (
              <button key={s.id} className="srcbtn na" title={t.notConfigured(hint)} onClick={props.onOpenSettings}>
                <span className="dot" />{label}
              </button>
            );
          })}
        </div>
      </div>
      {props.error && <div className="error">{props.error}</div>}
    </Card>
  );
}

function RunButton({ busy, ready, onRun }: { busy: boolean; ready: boolean; onRun: () => void }) {
  const t = useT().report.filters;
  return (
    <button className={`runbtn ${busy ? "busy" : ""}`} disabled={busy || !ready} title={ready ? t.runHint : t.setupJiraFirst} onClick={onRun}>
      {busy ? <span className="spin" /> : (
        <svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
      )}
      {busy ? t.running : t.run}
    </button>
  );
}
