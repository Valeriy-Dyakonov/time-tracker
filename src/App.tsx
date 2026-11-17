import { useEffect, useState } from "react";
import { api, inTauri } from "./api";
import { JiraUrlContext } from "./components/IssueLink";
import Report from "./components/Report";
import TitleBar from "./components/TitleBar";
import Settings from "./components/Settings";
import { setupState } from "./lib/setup";
import { defaultSettings, type Analysis, type Settings as S } from "./types";

const KEY = "worklog.analysis.v2";

function loadSaved(): Analysis | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as Analysis) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [tab, setTab] = useState<"report" | "settings">("report");
  const [settings, setSettings] = useState<S>(defaultSettings);
  const [analysis, setAnalysis] = useState<Analysis | null>(loadSaved);
  const [ready, setReady] = useState(!inTauri);
  const [stored, setStored] = useState<Record<string, boolean>>({});
  const refreshStored = () => api.secretsStatus().then(setStored).catch(() => {});

  useEffect(() => {
    if (!inTauri) return;
    Promise.all([api.loadSettings(), api.secretsStatus()])
      .then(([s, st]) => {
        setSettings({ ...defaultSettings, ...s });
        setStored(st);
        if (!setupState(s, st).jira) setTab("settings"); // first run: start with setup
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    try {
      if (analysis) localStorage.setItem(KEY, JSON.stringify(analysis));
      else localStorage.removeItem(KEY);
    } catch { /* storage unavailable */ }
  }, [analysis]);

  if (!ready) return null;

  return (
    <div className="shell">
    <TitleBar />
    <div className="scroll">
    <div className="app">
      <header className="topbar">
        <h1>Worklog Tracker</h1>
        <nav>
          <button className={tab === "report" ? "tab active" : "tab"} onClick={() => setTab("report")}>Отчёт</button>
          <button className={tab === "settings" ? "tab active" : "tab"} onClick={() => setTab("settings")}>Настройки</button>
        </nav>
      </header>
      <JiraUrlContext.Provider value={settings.jiraUrl}>
      <main>
        {tab === "settings" ? (
          inTauri ? <Settings settings={settings} onSaved={(s) => { setSettings(s); refreshStored(); }} /> : <p className="muted">Настройки доступны только в десктопном приложении.</p>
        ) : (
          <Report settings={settings} setup={setupState(settings, stored)} onOpenSettings={() => setTab("settings")} analysis={analysis} onChange={setAnalysis} />
        )}
      </main>
      </JiraUrlContext.Provider>
    </div>
    </div>
    </div>
  );
}
