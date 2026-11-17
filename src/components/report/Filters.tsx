import type { FillMode } from "../../types";
import { monthRange } from "../../lib/dates";
import type { SetupState } from "../../lib/setup";
import DateRange from "../DateRange";
import { Card, InfoTip, Segmented, Stepper } from "../ui";
import { ANALYSIS_SOURCES, type SourceToggles } from "./analysisSources";

export interface FilterValues {
  start: string;
  end: string;
  hours: number;
  fillMode: FillMode;
  sources: SourceToggles;
}

const PRESETS: [string, number][] = [["Этот месяц", 0], ["Прошлый месяц", -1]];
const activePreset = (start: string, end: string) =>
  PRESETS.map(([, offset]) => String(offset)).find((o) => { const r = monthRange(Number(o)); return r.start === start && r.end === end; }) ?? null;

const FILLS: [FillMode, string, string][] = [
  ["neighbors", "Как соседние", "Взять задачи и доли ближайшего дня, по которому есть события"],
  ["period", "По периоду", "Разделить день между задачами всего периода пропорционально их часам"],
  ["none", "Пустыми", "Ничего не заполнять — такие дни вы распределите сами"],
];

export function Filters(props: {
  value: FilterValues;
  onChange: (v: FilterValues) => void;
  setup: SetupState;
  busy: boolean;
  error: string;
  onRun: () => void;
  onOpenSettings: () => void;
}) {
  const v = props.value;
  const patch = (p: Partial<FilterValues>) => props.onChange({ ...v, ...p });

  return (
    <Card className="filters">
      <div className="f-grid">
        <div className="fg">
          <span className="f-label">Период<InfoTip>За какие дни собрать события и распределить часы. Обычно — месяц, за который сдаёте отчёт. Можно выбрать любой диапазон в календаре.</InfoTip></span>
          <div className="f-ctl">
            <Segmented value={activePreset(v.start, v.end)} onChange={(offset) => patch(monthRange(Number(offset)))}
              options={PRESETS.map(([label, offset]) => ({ value: String(offset), label }))} />
            <DateRange start={v.start} end={v.end} onChange={(start, end) => patch({ start, end })} />
          </div>
        </div>
        <div className="fg">
          <span className="f-label">Норма в день
            <InfoTip>Сколько часов нужно списать в каждый рабочий день. Время задач в дне масштабируется до этой суммы. Праздники и выходные не заполняются, предпраздничные дни короче (см. Настройки → Рабочее время).</InfoTip>
          </span>
          <div className="f-ctl"><Stepper value={v.hours} step={0.5} min={1} max={24} suffix="ч" onChange={(hours) => patch({ hours })} /></div>
        </div>
        <div className="fg">
          <span className="f-label">Дни без событий
            <InfoTip wide>
              Бывает, что в рабочий день нет ни коммитов, ни изменений в Jira, ни сообщений, ни встреч — например, день ушёл на чтение кода или созвон без календаря. Что ставить в такой день:
              <ul>{FILLS.map(([id, label, text]) => <li key={id}><b>{label}</b> — {text.charAt(0).toLowerCase() + text.slice(1)}.</li>)}</ul>
              Такие дни помечаются жёлтым, их стоит проверить.
            </InfoTip>
          </span>
          <div className="f-ctl">
            <Segmented value={v.fillMode} onChange={(fillMode) => patch({ fillMode })}
              options={FILLS.map(([value, label, title]) => ({ value, label, title }))} />
          </div>
        </div>
        <div className="fg run-wrap">
          <RunButton busy={props.busy} ready={props.setup.jira} onRun={props.onRun} />
        </div>
      </div>
      <div className="f-src">
        <span className="f-label">Источники
          <InfoTip>Откуда брать события. Jira нужна всегда: из неё берутся задачи. Остальные помогают понять, чем вы занимались в конкретный день. Пунктиром — ещё не настроенные; нажмите, чтобы подключить.</InfoTip>
        </span>
        <div className="srcpick">
          <button className="srcbtn on locked" title="Jira используется всегда: из неё берутся задачи и ваши действия в них" disabled><span className="dot" />Jira</button>
          {ANALYSIS_SOURCES.map((s) => {
            const on = v.sources[s.id];
            return props.setup[s.setup] ? (
              <button key={s.id} className={`srcbtn ${on ? "on" : ""}`} aria-pressed={on} title={s.hint} onClick={() => patch({ sources: { ...v.sources, [s.id]: !on } })}>
                <span className="dot" />{s.label}
              </button>
            ) : (
              <button key={s.id} className="srcbtn na" title={`${s.hint}. Не настроен — открыть настройки`} onClick={props.onOpenSettings}>
                <span className="dot" />{s.label}
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
  return (
    <button className={`runbtn ${busy ? "busy" : ""}`} disabled={busy || !ready} title={ready ? "Собрать события за период и распределить часы" : "Сначала настройте Jira"} onClick={onRun}>
      {busy ? <span className="spin" /> : (
        <svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
      )}
      {busy ? "Анализирую…" : "Проанализировать"}
    </button>
  );
}
