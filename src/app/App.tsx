import { useEffect, useState } from "react";
import { api, inTauri } from "@/shared/api";
import { JiraUrlContext } from "@/shared/components/IssueLink";
import Report from "@/products/worklog/components/report/Report";
import Dashboard from "@/products/dashboard/components/Dashboard";
import { useReminder } from "./useReminder";
import { asProfile } from "@/products/dashboard/lib/stages";
import Mrs from "@/products/mrs/components/Mrs";
import Team from "@/products/team/components/Team";
import Tags from "@/products/tags/components/Tags";
import { ErrorBoundary } from "./ErrorBoundary";
import Home from "./Home";
import type { ProductId } from "./products";
import TitleBar from "./TitleBar";
import Settings from "./settings/Settings";
import { useLocale, useT } from "@/i18n";
import { setupState } from "@/shared/lib/setup";
import { defaultSettings, type Analysis, type Settings as S } from "@/shared/types";

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
  // Subscribing here re-renders the whole tree on a language switch, including code that formats via getLocale().
  useLocale();
  const all = useT();
  const t = all.shell.app;
  // The start screen shows the tools; settings are shared and open over whichever screen is current.
  const [view, setView] = useState<"home" | ProductId>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        if (!setupState(s, st).jira) setSettingsOpen(true); // first run: start with setup
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

  // Before the early return below: hooks must run on every render.
  useReminder(settings, setupState(settings, stored).jira, ready && inTauri);

  // Same markup as in index.html: the loader stays put until settings are read.
  if (!ready) return <div className="boot" role="status" aria-busy="true"><span className="boot-name">Worklog Tracker</span><span className="boot-bar"><i /></span></div>;

  const setup = setupState(settings, stored);
  const openSettings = () => setSettingsOpen(true);
  const where = view === "home" ? all.home.title : all.home.products[view].name;

  return (
    <div className="shell">
    <TitleBar
      title={view === "home" ? undefined : all.home.products[view].name}
      onHome={view === "home" && !settingsOpen ? undefined : () => { setSettingsOpen(false); setView("home"); }}
      settingsOpen={settingsOpen}
      onToggleSettings={() => setSettingsOpen(!settingsOpen)}
    />
    <div className="scroll">
    <div className="app">
      {settingsOpen ? (
        <header className="pagehead">
          <button className="back" onClick={() => setSettingsOpen(false)} title={all.home.back(where)}>
            <svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" /></svg>{where}
          </button>
          <h2>{t.settings}</h2>
        </header>
      ) : <div className="pagegap" />}
      <JiraUrlContext.Provider value={settings.jiraUrl}>
      <main>
      <ErrorBoundary key={settingsOpen ? "settings" : view} onHome={() => { setSettingsOpen(false); setView("home"); }}>
        {settingsOpen ? (
          inTauri ? <Settings settings={settings} onSaved={(s) => { setSettings(s); refreshStored(); }} /> : <p className="muted">{t.desktopOnly}</p>
        ) : view === "home" ? (
          <Home jiraReady={setup.jira} onOpen={setView} />
        ) : view === "dashboard" ? (
          <Dashboard setup={setup} profile={asProfile(settings.dashboardProfile)} onOpenSettings={openSettings} />
        ) : view === "mrs" ? (
          <Mrs setup={setup} profile={asProfile(settings.dashboardProfile)} onOpenSettings={openSettings} />
        ) : view === "tags" ? (
          <Tags setup={setup} onOpenSettings={openSettings} />
        ) : view === "team" ? (
          <Team />
        ) : (
          <Report settings={settings} setup={setup} onOpenSettings={openSettings} analysis={analysis} onChange={setAnalysis} />
        )}
      </ErrorBoundary>
      </main>
      </JiraUrlContext.Provider>
    </div>
    </div>
    </div>
  );
}
