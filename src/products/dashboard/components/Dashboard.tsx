import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import { useStored } from "@/shared/hooks/useStored";
import { localDate } from "@/shared/lib/dates";
import type { SetupState } from "@/shared/lib/setup";
import type { DashData, DashIssue } from "@/shared/types";
import { Button, InfoTip, Switch } from "@/shared/ui";
import { containerCandidates, containerTypes } from "../lib/containers";
import { byColumn, filterIssues, projectsOf, sortForProfile, splitFolded, visibleColumns } from "../lib/groups";
import { normalizeData } from "../lib/normalize";
import { flagsOf, PROFILE, PROFILE_FLAGS, STALE_DAYS, stageOf, type Flag, type Profile, type Stage } from "../lib/stages";
import { Board } from "./Board";
import { ContainerPicker } from "./ContainerPicker";
import { History } from "./History";
import { IssueCard } from "./IssueCard";
import { IssueDrawer } from "./IssueDrawer";
import { OpenByKey } from "./OpenByKey";

type Cached = { at: number; data: DashData };
// v3: tasks carry links; older caches lack them and are not read.
const cacheKey = (p: Profile) => `worklog.dashboard.v3.${p}`;

function readCache(p: Profile): Cached | null {
  try {
    const s = localStorage.getItem(cacheKey(p));
    if (!s) return null;
    const c = JSON.parse(s) as Partial<Cached>;
    return { at: Number(c.at) || 0, data: normalizeData(c.data) };
  } catch {
    return null;
  }
}

/** "Work dashboard": open tasks for a role on one Jira-like board; closed ones in a history read on demand. Read-only. */
export default function Dashboard({ setup, profile, onOpenSettings }: { setup: SetupState; profile: Profile; onOpenSettings: () => void }) {
  const m = useT().dashboard;
  const jiraReady = setup.jira;
  /** Issue types that count as an epic; null = guessed from the type names. */
  const [chosenTypes, setChosenTypes] = useStored<string[] | null>("worklog.dashboard.containerTypes", null);
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
      const next = { at: Date.now(), data: normalizeData(await api.jiraDashboard(p)) };
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
  // Done tasks belong to the history, even if a cache from an older version still has them.
  const all = useMemo(() => (data?.issues ?? []).filter((i) => stageOf(i) !== "done"), [data]);
  const context = useMemo(() => new Map([...(data?.context ?? []), ...(data?.issues ?? [])].map((i) => [i.key, i])), [data]);
  const projectSet = useMemo(() => new Set([...(data?.projects ?? []), ...[...context.values()].map((i) => i.project)]), [data, context]);
  const scope = useCallback(
    (list: DashIssue[]) => filterIssues(list, { profile, project, query, stage: null, flag: null, onlyMine }, today, now),
    [profile, project, query, onlyMine, today, now],
  );
  const scoped = useMemo(() => scope(all), [scope, all]);
  const shown = useMemo(
    () => sortForProfile(filterIssues(scoped, { profile, project: null, query: "", ...focus, onlyMine: false }, today, now), profile, today, now),
    [scoped, focus, profile, today, now],
  );
  const { main, folded } = useMemo(() => splitFolded(shown, profile), [shown, profile]);
  const candidates = useMemo(() => containerCandidates(all, context), [all, context]);
  const types = useMemo(() => containerTypes(chosenTypes, candidates), [chosenTypes, candidates]);
  const columns = useMemo(() => visibleColumns(main), [main]);
  const cells = useMemo(() => byColumn(main, columns), [main, columns]);
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
      <div className="dash-top">
        <span className="dash-profile">{m.profileLabel}: <b>{m.profiles[profile]}</b></span>
        <InfoTip>{m.profileTip}</InfoTip>
        <Button variant="link" title={m.changeProfileTitle} onClick={onOpenSettings}>{m.changeProfile}</Button>
        <span className="spacer" />
        <OpenByKey onOpen={setOpened} />
        <span className="dash-sync muted">
          {loading ? <><i className="spin" />{m.loading}</> : cached && m.updatedAt(new Date(cached.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}
        </span>
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
        <input type="search" className="dash-search" value={query} placeholder={m.search} onChange={(e) => setQuery(e.target.value)} />
        <select value={project ?? ""} onChange={(e) => setProject(e.target.value || null)}>
          <option value="">{m.allProjects} ({all.length})</option>
          {projects.map((p) => <option key={p.key} value={p.key}>{p.key} — {p.name} ({p.count})</option>)}
        </select>
        <ContainerPicker candidates={candidates} active={types} chosen={chosenTypes} onChange={setChosenTypes} />
        {!spec.mineOnly && <Switch checked={onlyMine} onChange={setOnlyMine} title={m.onlyMineTip}>{m.onlyMine}</Switch>}
        {(focus.stage || focus.flag) && <Button variant="ghost" size="small" onClick={() => setFocus({ stage: null, flag: null })}>{m.clearFilter}</Button>}
      </div>
      {error && <div className="error">{m.failed(error)}</div>}
      {data && shown.length === 0 && <p className="muted">{all.length ? m.nothing : m.empty}</p>}

      {main.length > 0 && <Board columns={columns} cells={cells} context={context} types={types} today={today} now={now} onOpen={setOpened} />}

      {folded.length > 0 && (
        <details className="dash-folded">
          <summary><b>{m.folded(folded.length)}</b><InfoTip>{m.foldedTip}</InfoTip></summary>
          <div className="dash-cards">{folded.map((i) => <IssueCard key={i.key} i={i} today={today} now={now} onOpen={setOpened} />)}</div>
        </details>
      )}

      <History profile={profile} filter={scope} onOpen={setOpened} />

      {opened && <IssueDrawer issueKey={opened} context={context} projects={projectSet} setup={setup} profile={profile} onClose={() => setOpened(null)} onSettings={() => { setOpened(null); onOpenSettings(); }} />}
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
