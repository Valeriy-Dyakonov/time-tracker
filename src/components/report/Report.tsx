import { useState } from "react";
import type { Analysis, DayPlan, DayProgress, LogEntry, Settings } from "../../types";
import { monthRange } from "../../lib/dates";
import { runAnalysis } from "../../lib/pipeline";
import type { SetupState } from "../../lib/setup";
import { Hours } from "../hours/Hours";
import { Stats } from "../hours/Stats";
import { LivePanel, LogList, logText } from "../live";
import AiReview from "../review/AiReview";
import Submit from "../submit/Submit";
import { Button, Card, CopyButton, Title } from "../ui";
import { allSourcesOn, sourceFlags } from "./analysisSources";
import { Export } from "./Export";
import { Filters, type FilterValues } from "./Filters";
import { ViewTabs, type View } from "./ViewTabs";

type Live = { days: DayProgress[]; log: LogEntry[] };

export default function Report(props: {
  settings: Settings;
  setup: SetupState;
  onOpenSettings: () => void;
  analysis: Analysis | null;
  onChange: (a: Analysis | null) => void;
}) {
  const { settings, setup, analysis: a } = props;
  const [filters, setFilters] = useState<FilterValues>(() => ({
    ...monthRange(0),
    hours: settings.hoursPerDay,
    fillMode: "neighbors",
    sources: allSourcesOn(),
  }));
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
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

  return (
    <div>
      <Filters value={filters} onChange={setFilters} setup={setup} busy={busy} error={error} onRun={run} onOpenSettings={props.onOpenSettings} />

      {showLive && <LivePanel days={live!.days} log={live!.log} running={busy} />}

      {!showLive && a && (
        <>
          <Stats a={a} onReview={() => { setView("weeks"); setOnlyReview(true); }} />
          {a.warnings.length > 0 && (
            <details className="warnings" open={a.warnings.length < 4}>
              <summary>Замечания ({a.warnings.length})</summary>
              <ul>{a.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              <p className="hint">Подробности — на вкладке «Журнал».</p>
            </details>
          )}
          <ViewTabs view={view} onChange={setView} />
          {view === "weeks" && <Hours a={a} updateDay={updateDay} onlyReview={onlyReview} setOnlyReview={setOnlyReview} onAi={() => setView("ai")} />}
          {view === "submit" && <Submit a={a} canAi={setup.llm} />}
          {view === "ai" && <AiReview a={a} />}
          {view === "log" && (
            <Card>
              <div className="row">
                <Title tip="Пошаговый протокол анализа: какие источники опрошены, сколько событий пришло, где были ошибки. Пригодится, если результат выглядит странно.">Журнал анализа</Title>
                <span className="spacer" />
                <CopyButton label="Скопировать журнал" text={() => logText(a.log)} />
              </div>
              <LogList entries={a.log} />
            </Card>
          )}
          {view === "export" && <Export a={a} />}
        </>
      )}

      {!showLive && !a && !busy && <Welcome ready={setup.jira} onOpenSettings={props.onOpenSettings} />}
    </div>
  );
}

function Welcome({ ready, onOpenSettings }: { ready: boolean; onOpenSettings: () => void }) {
  return (
    <Card className="banner">
      {ready ? (
        <>
          <h3>Всё готово</h3>
          <p className="muted">Выберите период и нажмите «Проанализировать». Вы увидите, как день за днём идёт анализ, а затем получите часы по дням и неделям, готовые значения для списания и человеческий разбор от ИИ.</p>
        </>
      ) : (
        <>
          <h3>Добро пожаловать 👋</h3>
          <p className="muted">Чтобы построить отчёт, нужно один раз подключить Jira (адрес и персональный токен). В настройках для каждого сервиса есть инструкция, где взять токен. Git, Confluence, календарь, Matrix и ИИ подключаются по желанию.</p>
          <div className="row"><Button variant="primary" onClick={onOpenSettings}>Открыть настройки</Button></div>
        </>
      )}
    </Card>
  );
}
