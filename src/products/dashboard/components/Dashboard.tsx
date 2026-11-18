import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import { useStored } from "@/shared/hooks/useStored";
import { localDate } from "@/shared/lib/dates";
import type { DashData } from "@/shared/types";
import { Button, InfoTip, Segmented, Switch } from "@/shared/ui";
import { filterIssues, GROUPINGS, groupIssues, projectsOf, sortForProfile, splitFolded, type Grouping } from "../lib/groups";
import { flagsOf, PROFILE, PROFILE_FLAGS, PROFILES, STALE_DAYS, stageOf, type Flag, type Profile, type Stage } from "../lib/stages";
import { GroupList } from "./GroupList";
import { IssueCard } from "./IssueCard";
import { IssueDrawer } from "./IssueDrawer";

type Cached = { at: number; data: DashData };
const cacheKey = (p: Profile) => `worklog.dashboard.v2.${p}`;

function readCache(p: Profile): Cached | null {
  try {
    const s = localStorage.getItem(cacheKey(p));
    return s ? (JSON.parse(s) as Cached) : null;
  } catch {
    return null;
  }
}

/** "Work dashboard": tasks for a role, grouped by epic, release or stage; a task opens in a side panel. Read-only. */
export default function Dashboard({ jiraReady, onOpenSettings }: { jiraReady: boolean; onOpenSettings: () => void }) {
  const m = useT().dashboard;
  const [profile, setProfile] = useStored<Profile>("worklog.dashboard.profile", "dev");
  const [by, setBy] = useStored<Grouping>("worklog.dashboard.grouping", "epic");
  const [onlyMine, setOnlyMine] = useStored("worklog.dashboard.onlyMine", false);
  const [cached, setCached] = useState<Cached | null>(() => readCache(profile));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [project, setProject] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<{ stage: Stage | null; flag: Flag | null }>({ stage: null, flag: null });
  const [opened, setOpened] = useState<string | null>(null);
  const today = localDate(new Date());

  const load = useCallback(async (p: Profile) => {
    setLoading(true);
    setError("");
    try {
      const next = { at: Date.now(), data: await api.jiraDashboard(p) };
      setCached(next);
      try { localStorage.setItem(cacheKey(p), JSON.stringify(next)); } catch { /* storage unavailable */ }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCached(readCache(profile));
    setFocus({ stage: null, flag: null });
    if (jiraReady) void load(profile);
  }, [profile, jiraReady, load]);

  const data = cached?.data;
  // "Now" of the loaded data: flags such as "stuck" stay stable between renders.
  const now = useMemo(() => Date.now(), [cached]);
  const all = useMemo(() => data?.issues ?? [], [data]);
  const context = useMemo(() => new Map([...(data?.context ?? []), ...all].map((i) => [i.key, i])), [data, all]);
  const scoped = useMemo(() => filterIssues(all, { profile, project, query, stage: null, flag: null, onlyMine }, today, now), [all, profile, project, query, onlyMine, today, now]);
  const shown = useMemo(
    () => sortForProfile(filterIssues(scoped, { profile, project: null, query: "", ...focus, onlyMine: false }, today, now), profile, today, now),
    [scoped, focus, profile, today, now],
  );
  const { main, folded } = useMemo(() => splitFolded(shown, profile), [shown, profile]);
  const groups = useMemo(() => groupIssues(main, by, data?.context ?? [], profile), [main, by, data, profile]);
  const projects = useMemo(() => projectsOf(all), [all]);

  if (!jiraReady) {
    return (
      <div className="card dash-empty">
        <p>{m.needsJira}</p>
        <Button variant="primary" onClick={onOpenSettings}>{m.openSettings}</Button>
      </div>
    );
  }

  const spec = PROFILE[profile];
  const stageCount = (s: Stage) => scoped.filter((i) => stageOf(i) === s).length;
  const flagCount = (f: Flag) => scoped.filter((i) => flagsOf(i, today, now).includes(f)).length;
  const pick = (next: { stage: Stage | null; flag: Flag | null }) =>
    setFocus((cur) => (cur.stage === next.stage && cur.flag === next.flag ? { stage: null, flag: null } : next));

  return (
    <div className="dash">
      <div className="dash-bar">
        <Segmented value={profile} onChange={setProfile} options={PROFILES.map((p) => ({ value: p, label: m.profiles[p] }))} />
        <InfoTip>{m.profileTip}</InfoTip>
        <span className="spacer" />
        {loading ? <span className="muted">{m.loading}</span> : cached && <span className="muted">{m.updatedAt(new Date(cached.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</span>}
        <Button size="small" disabled={loading} onClick={() => void load(profile)}>{m.refresh}</Button>
      </div>

      <div className="dash-stats">
        {spec.focus.map((s) => (
          <Tile key={s} label={m.stages[s]} value={stageCount(s)} on={focus.stage === s} tone={`s-${s}`} onClick={() => pick({ stage: s, flag: null })} />
        ))}
        {PROFILE_FLAGS[profile].map((f) => (
          <Tile key={f} label={m.flags[f]} value={flagCount(f)} on={focus.flag === f} tone={flagCount(f) ? `f-${f}` : ""}
            tip={f === "stale" ? m.flagTips.stale(STALE_DAYS) : m.flagTips[f]} onClick={() => pick({ stage: null, flag: f })} />
        ))}
      </div>

      <div className="dash-bar">
        <Segmented size="small" value={by} onChange={setBy} options={GROUPINGS.map((g) => ({ value: g, label: m.groupings[g] }))} />
        <select value={project ?? ""} onChange={(e) => setProject(e.target.value || null)}>
          <option value="">{m.allProjects} ({all.length})</option>
          {projects.map((p) => <option key={p.key} value={p.key}>{p.key} — {p.name} ({p.count})</option>)}
        </select>
        <input type="search" value={query} placeholder={m.search} onChange={(e) => setQuery(e.target.value)} />
        {!spec.mineOnly && <Switch checked={onlyMine} onChange={setOnlyMine} title={m.onlyMineTip}>{m.onlyMine}</Switch>}
        {(focus.stage || focus.flag) && <Button variant="ghost" size="small" onClick={() => setFocus({ stage: null, flag: null })}>{m.clearFilter}</Button>}
      </div>
      {error && <div className="error">{m.failed(error)}</div>}
      {data && shown.length === 0 && <p className="muted">{all.length ? m.nothing : m.empty}</p>}

      <GroupList groups={groups} by={by} today={today} now={now} onOpen={setOpened} />

      {folded.length > 0 && (
        <details className="dash-folded">
          <summary>{m.folded(folded.length)}<InfoTip>{m.foldedTip}</InfoTip></summary>
          <div className="dash-cards">{folded.map((i) => <IssueCard key={i.key} i={i} today={today} now={now} onOpen={setOpened} />)}</div>
        </details>
      )}

      {opened && <IssueDrawer issueKey={opened} context={context} onClose={() => setOpened(null)} />}
    </div>
  );
}

function Tile(props: { label: string; value: number; on: boolean; tone: string; tip?: string; onClick: () => void }) {
  const m = useT().dashboard;
  return (
    <button className={`dash-stat ${props.tone} ${props.on ? "on" : ""}`} title={props.tip ?? m.tileTip} onClick={props.onClick}>
      <span className="dash-stat-l">{props.label}</span>
      <b>{props.value}</b>
    </button>
  );
}
