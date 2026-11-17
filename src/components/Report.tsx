import { useMemo, useState } from "react";
import type { Analysis, DayPlan, DayProgress, FillMode, LogEntry, Settings } from "../types";
import { dayTotal, rebalance, STEP } from "../lib/allocate";
import { formatRu, monthRange, monthShort, plural, weekdayName } from "../lib/dates";
import {
  daysCsv, dayText, fmtH, fmtMinutes, grandTotal, markdown, meetingMinutes, targetTotal, tasksCsv,
  totalsByTask, weeksOf,
} from "../lib/report";
import { runAnalysis } from "../lib/pipeline";
import type { SetupState } from "../lib/setup";
import AiReview from "./AiReview";
import Submit from "./Submit";
import { Timesheet, Verdict } from "./Timesheet";
import IssueLink from "./IssueLink";
import Meetings from "./Meetings";
import { LivePanel, LogList, logText } from "./live";
import { CopyButton, download, keyColor } from "./ui";

type View = "weeks" | "submit" | "ai" | "log" | "export";
const TABS: [View, string][] = [
  ["weeks", "Часы"], ["submit", "Списание"], ["ai", "Разбор ИИ"], ["log", "Журнал"], ["export", "Экспорт"],
];

export default function Report(props: {
  settings: Settings;
  setup: SetupState;
  onOpenSettings: () => void;
  analysis: Analysis | null;
  onChange: (a: Analysis | null) => void;
}) {
  const { settings, setup, analysis: a } = props;
  const init = monthRange(0);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [hours, setHours] = useState(settings.hoursPerDay);
  const [useGit, setUseGit] = useState(true);
  const [useMatrix, setUseMatrix] = useState(true);
  const [useGitlab, setUseGitlab] = useState(true);
  const [useConfluence, setUseConfluence] = useState(true);
  const [useCalendar, setUseCalendar] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const [fillMode, setFillMode] = useState<FillMode>("neighbors");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<{ days: DayProgress[]; log: LogEntry[] } | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("weeks");
  const [onlyReview, setOnlyReview] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    setLive({ days: [], log: [] });
    try {
      const res = await runAnalysis(
        settings,
        {
          start, end, hoursPerDay: hours, useJira: true, fillMode,
          useGit: useGit && setup.git,
          useMatrix: useMatrix && setup.matrix,
          useGitlab: useGitlab && setup.gitlab,
          useConfluence: useConfluence && setup.confluence,
          useCalendar: useCalendar && setup.calendar,
          useAi: useAi && setup.llm,
        },
        {
          onLog: (e) => setLive((l) => (l ? { ...l, log: [...l.log, e] } : l)),
          onDays: (d) => setLive((l) => (l ? { ...l, days: d } : l)),
        },
      );
      props.onChange(res);
      setView("weeks");
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
  const src = (label: string, on: boolean, set: (v: boolean) => void, ready: boolean) =>
    ready ? (
      <button className={`srcbtn ${on ? "on" : ""}`} aria-pressed={on} onClick={() => set(!on)}>
        <span className="dot" />{label}
      </button>
    ) : (
      <button className="srcbtn na" title="Не настроен — открыть настройки" onClick={props.onOpenSettings}>
        <span className="dot" />{label}
      </button>
    );
  const presets: [string, number][] = [["Этот месяц", 0], ["Прошлый месяц", -1]];
  const fills: [FillMode, string, string][] = [
    ["neighbors", "по соседним", "Заполнить по задачам соседних дней"],
    ["period", "по периоду", "Распределить по задачам всего периода"],
    ["none", "оставить", "Оставить такие дни пустыми"],
  ];

  return (
    <div>
      <section className="card filters">
        <div className="f-row">
          <div className="seg">
            {presets.map(([l, off]) => {
              const r = monthRange(off);
              return <button key={l} className={start === r.start && end === r.end ? "on" : ""} onClick={() => { setStart(r.start); setEnd(r.end); }}>{l}</button>;
            })}
          </div>
          <div className="daterange" title="Свой период">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <span>—</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <label className="unit" title="Сколько часов списывать в рабочий день">
            <input type="number" min={1} max={24} step={0.25} value={hours} onChange={(e) => setHours(Number(e.target.value) || 8)} />
            <span>ч/день</span>
          </label>
          <span className="spacer" />
          <button className="btn primary run" disabled={busy || !setup.jira} title={setup.jira ? "" : "Сначала настройте Jira"} onClick={run}>{busy ? "Анализирую…" : "Проанализировать"}</button>
        </div>
        <div className="f-row">
          <span className="f-label">Источники</span>
          <div className="srcs">
            <button className="srcbtn on locked" title="Jira используется всегда" disabled><span className="dot" />Jira</button>
            {src("Git", useGit, setUseGit, setup.git)}
            {src("GitLab", useGitlab, setUseGitlab, setup.gitlab)}
            {src("Confluence", useConfluence, setUseConfluence, setup.confluence)}
            {src("Календарь", useCalendar, setUseCalendar, setup.calendar)}
            {src("Matrix", useMatrix, setUseMatrix, setup.matrix)}
            {src("Анализ ИИ", useAi, setUseAi, setup.llm)}
          </div>
          <span className="spacer" />
          <span className="f-label" title="Что делать с рабочими днями, по которым не нашлось ни одного события">Дни без данных</span>
          <div className="seg small">
            {fills.map(([v, l, t]) => <button key={v} title={t} className={fillMode === v ? "on" : ""} onClick={() => setFillMode(v)}>{l}</button>)}
          </div>
        </div>
        {error && <div className="error">{error}</div>}
      </section>

      {showLive && <LivePanel days={live!.days} log={live!.log} running={busy} />}

      {!showLive && a && (
        <>
          <Verdict a={a} onReview={() => { setView("weeks"); setOnlyReview(true); }} />
          {a.warnings.length > 0 && (
            <details className="warnings" open={a.warnings.length < 4}>
              <summary>Замечания ({a.warnings.length})</summary>
              <ul>{a.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              <p className="hint">Подробности — на вкладке «Журнал».</p>
            </details>
          )}
          <div className="tabs">
            {TABS.map(([v, l]) => (
              <button key={v} className={view === v ? "tab active" : "tab"} onClick={() => setView(v)}>{l}</button>
            ))}
          </div>
          {view === "weeks" && <Timesheet a={a} updateDay={updateDay} onlyReview={onlyReview} setOnlyReview={setOnlyReview} onAi={() => setView("ai")} />}
          {view === "submit" && <Submit a={a} canAi={setup.llm} />}
          {view === "ai" && <AiReview a={a} />}
          {view === "log" && (
            <section className="card">
              <div className="row"><h3 style={{ margin: 0 }}>Журнал анализа</h3><span className="spacer" /><CopyButton label="Скопировать журнал" text={() => logText(a.log)} /></div>
              <LogList entries={a.log} />
            </section>
          )}
          {view === "export" && <Export a={a} />}
        </>
      )}

      {!showLive && !a && !busy && (
        <section className="card banner">
          {setup.jira ? (
            <>
              <h3>Всё готово</h3>
              <p className="muted">Выберите период и нажмите «Проанализировать». Вы увидите, как день за днём идёт анализ, а затем получите часы по дням и неделям, готовые значения для списания и человеческий разбор от ИИ.</p>
            </>
          ) : (
            <>
              <h3>Добро пожаловать 👋</h3>
              <p className="muted">Чтобы построить отчёт, нужно один раз подключить Jira (адрес и персональный токен). В настройках для каждого сервиса есть инструкция, где взять токен. Git, Confluence, календарь, Matrix и ИИ подключаются по желанию.</p>
              <div className="row"><button className="btn primary" onClick={props.onOpenSettings}>Открыть настройки</button></div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Export({ a }: { a: Analysis }) {
  const name = `worklog_${a.start}_${a.end}`;
  return (
    <section className="card export">
      <p className="muted">Для Jira — строка на каждую пару «день + задача». Для системы по дням — строка на день (со звонками и встречами).</p>
      <div className="row wrap">
        <button className="btn" onClick={() => download(`${name}_tasks.csv`, tasksCsv(a), "text/csv")}>CSV по задачам</button>
        <button className="btn" onClick={() => download(`${name}_days.csv`, daysCsv(a), "text/csv")}>CSV по дням</button>
        <button className="btn" onClick={() => download(`${name}.md`, markdown(a), "text/markdown")}>Markdown-отчёт</button>
        <CopyButton label="Скопировать Markdown" text={() => markdown(a)} />
      </div>
    </section>
  );
}
