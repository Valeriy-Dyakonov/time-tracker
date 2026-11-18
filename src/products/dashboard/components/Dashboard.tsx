import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/shared/api";
import { dateShort, useT } from "@/i18n";
import { localDate } from "@/shared/lib/dates";
import { boardColumns, CATEGORIES, dashStats, filterIssues, isOverdue, projectsOf, type Category } from "../lib/dashboard";
import type { DashIssue } from "@/shared/types";
import IssueLink from "@/shared/components/IssueLink";
import { Button, InfoTip, keyColor } from "@/shared/ui";

const CACHE = "worklog.dashboard.v1";
/** Must match RECENT_DAYS in src-tauri/src/sources/jira/dashboard.rs. */
const RECENT_DAYS = 14;

type Cached = { at: number; list: DashIssue[] };

function readCache(): Cached | null {
  try {
    const s = localStorage.getItem(CACHE);
    return s ? (JSON.parse(s) as Cached) : null;
  } catch {
    return null;
  }
}

/** "Work dashboard": the user's Jira tasks by status, for a quick look at where things stand. Read-only. */
export default function Dashboard({ jiraReady, onOpenSettings }: { jiraReady: boolean; onOpenSettings: () => void }) {
  const t = useT();
  const m = t.dashboard;
  const [data, setData] = useState<Cached | null>(readCache);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [project, setProject] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const today = localDate(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = { at: Date.now(), list: await api.jiraMyIssues() };
      setData(next);
      try { localStorage.setItem(CACHE, JSON.stringify(next)); } catch { /* storage unavailable */ }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (jiraReady) void load(); }, [jiraReady, load]);

  const list = data?.list ?? [];
  const shown = useMemo(() => filterIssues(list, { project, query }), [list, project, query]);
  const stats = dashStats(shown, today);
  const cols = useMemo(() => boardColumns(shown, today), [shown, today]);
  const projects = useMemo(() => projectsOf(list), [list]);

  if (!jiraReady) {
    return (
      <div className="card dash-empty">
        <p>{m.needsJira}</p>
        <Button variant="primary" onClick={onOpenSettings}>{m.openSettings}</Button>
      </div>
    );
  }

  const ago = (ms: number | null) => {
    if (!ms) return "";
    const min = Math.round((Date.now() - ms) / 60000);
    if (min < 1) return m.ago.now;
    if (min < 60) return m.ago.min(min);
    if (min < 48 * 60) return m.ago.hours(Math.round(min / 60));
    return m.ago.days(Math.round(min / 1440));
  };
  const colTitle = (c: Category) => (c === "done" ? m.columns.done(RECENT_DAYS) : m.columns[c]);

  return (
    <div className="dash">
      <div className="dash-stats">
        <Stat label={m.stats.open} tip={m.stats.openTip} value={stats.open} />
        <Stat label={m.stats.inProgress} tip={m.stats.inProgressTip} value={stats.inProgress} tone="accent" />
        <Stat label={m.stats.overdue} tip={m.stats.overdueTip} value={stats.overdue} tone={stats.overdue ? "bad" : undefined} />
        <Stat label={m.stats.done(RECENT_DAYS)} tip={m.stats.doneTip} value={stats.done} tone="good" />
      </div>

      <div className="dash-bar">
        <select value={project ?? ""} onChange={(e) => setProject(e.target.value || null)}>
          <option value="">{m.allProjects} ({list.length})</option>
          {projects.map((p) => <option key={p.key} value={p.key}>{p.key} — {p.name} ({p.count})</option>)}
        </select>
        <input type="search" value={query} placeholder={m.search} onChange={(e) => setQuery(e.target.value)} />
        <span className="spacer" />
        {loading ? <span className="muted">{m.loading}</span> : data && <span className="muted">{m.updatedAt(new Date(data.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</span>}
        <Button size="small" disabled={loading} onClick={() => void load()}>{m.refresh}</Button>
      </div>
      {error && <div className="error">{m.failed(error)}</div>}
      {data && shown.length === 0 && <p className="muted">{list.length ? m.nothing : m.empty}</p>}

      <div className="dash-board">
        {CATEGORIES.map((c) => (
          <section key={c} className={`dash-col c-${c}`}>
            <header><b>{colTitle(c)}</b><span className="dash-n">{cols[c].reduce((s, g) => s + g.issues.length, 0)}</span></header>
            {cols[c].map((g) => (
              <div key={g.status} className="dash-group">
                <h5>{g.status}<span className="dash-n">{g.issues.length}</span></h5>
                {g.issues.map((i) => {
                  const late = isOverdue(i, today);
                  return (
                    <article key={i.key} className={`dash-card ${late ? "late" : ""}`}>
                      <div className="dash-card-h">
                        <span className="dot" style={{ background: keyColor(i.key) }} />
                        <b><IssueLink k={i.key} /></b>
                        <span className="muted dash-type">{i.issueType}</span>
                        <span className="spacer" />
                        {i.due && <span className={`dash-due ${late ? "late" : ""}`}>{late ? m.overdue(dateShort(i.due)) : m.due(dateShort(i.due))}</span>}
                      </div>
                      <div className="dash-sum" title={i.summary}>{i.summary}</div>
                      <div className="dash-meta muted">
                        {i.priority && <span>{i.priority}</span>}
                        {i.parent && <span>↑ {i.parent}</span>}
                        <span className="spacer" />
                        <span title={m.updatedTitle}>{ago(c === "done" ? i.resolved : i.updated)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, tip, value, tone }: { label: string; tip: string; value: number; tone?: "accent" | "good" | "bad" }) {
  return (
    <div className={`dash-stat ${tone ?? ""}`}>
      <span className="dash-stat-l">{label}<InfoTip>{tip}</InfoTip></span>
      <b>{value}</b>
    </div>
  );
}
