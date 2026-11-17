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
import { CopyButton, download, InfoTip, keyColor, Stepper } from "./ui";

type View = "weeks" | "submit" | "ai" | "log" | "export";
const TABS: [View, string, JSX.Element][] = [
  ["weeks", "Часы", <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>],
  ["submit", "Списание", <><path d="M5 12l4 4L19 6" /></>],
  ["ai", "Разбор ИИ", <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></>],
  ["log", "Журнал", <><path d="M5 6h14M5 12h14M5 18h9" /></>],
  ["export", "Экспорт", <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>],
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
    ["neighbors", "Как соседние", "Взять задачи и доли ближайшего дня, по которому есть события"],
    ["period", "По периоду", "Разделить день между задачами всего периода пропорционально их часам"],
    ["none", "Пустыми", "Ничего не заполнять — такие дни вы распределите сами"],
  ];

  return (
    <div>
      <section className="card filters">
        <div className="f-grid">
          <div className="fg">
            <span className="f-label">Период</span>
            <div className="f-ctl">
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
            </div>
          </div>
          <div className="fg">
            <span className="f-label">Норма в день
              <InfoTip>Сколько часов нужно списать в каждый рабочий день. Время задач в дне масштабируется до этой суммы. Праздники и выходные не заполняются, предпраздничные дни короче (см. Настройки → Рабочее время).</InfoTip>
            </span>
            <div className="f-ctl"><Stepper value={hours} step={0.5} min={1} max={24} suffix="ч" onChange={setHours} /></div>
          </div>
          <div className="fg">
            <span className="f-label">Дни без событий
              <InfoTip wide>
                Бывает, что в рабочий день нет ни коммитов, ни изменений в Jira, ни сообщений, ни встреч — например, день ушёл на чтение кода или созвон без календаря. Что ставить в такой день:
                <ul>{fills.map(([v, l, t]) => <li key={v}><b>{l}</b> — {t.charAt(0).toLowerCase() + t.slice(1)}.</li>)}</ul>
                Такие дни помечаются жёлтым, их стоит проверить.
              </InfoTip>
            </span>
            <div className="f-ctl">
              <div className="seg">
                {fills.map(([v, l, t]) => <button key={v} title={t} className={fillMode === v ? "on" : ""} onClick={() => setFillMode(v)}>{l}</button>)}
              </div>
            </div>
          </div>
          <div className="fg run-wrap">
            <button className={`runbtn ${busy ? "busy" : ""}`} disabled={busy || !setup.jira} title={setup.jira ? "Собрать события за период и распределить часы" : "Сначала настройте Jira"} onClick={run}>
              {busy ? <span className="spin" /> : (
                <svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
              )}
              {busy ? "Анализирую…" : "Проанализировать"}
            </button>
          </div>
        </div>
        <div className="f-src">
          <span className="f-label">Источники
            <InfoTip>Откуда брать события. Jira нужна всегда: из неё берутся задачи. Остальные помогают понять, чем вы занимались в конкретный день. Пунктиром — ещё не настроенные; нажмите, чтобы подключить.</InfoTip>
          </span>
          <div className="srcpick">
            <button className="srcbtn on locked" title="Jira используется всегда" disabled><span className="dot" />Jira</button>
            {src("Git", useGit, setUseGit, setup.git)}
            {src("GitLab", useGitlab, setUseGitlab, setup.gitlab)}
            {src("Confluence", useConfluence, setUseConfluence, setup.confluence)}
            {src("Календарь", useCalendar, setUseCalendar, setup.calendar)}
            {src("Matrix", useMatrix, setUseMatrix, setup.matrix)}
            {src("Анализ ИИ", useAi, setUseAi, setup.llm)}
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
          <nav className="viewtabs" role="tablist">
            {TABS.map(([v, l, icon]) => (
              <button key={v} role="tab" aria-selected={view === v} className={view === v ? "vt on" : "vt"} onClick={() => setView(v)}>
                <svg viewBox="0 0 24 24">{icon}</svg>{l}
              </button>
            ))}
          </nav>
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
