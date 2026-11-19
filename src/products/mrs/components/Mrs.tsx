import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import { useStored } from "@/shared/hooks/useStored";
import type { SetupState } from "@/shared/lib/setup";
import type { DashProfile, MrBoard, Roster } from "@/shared/types";
import { Button, InfoTip, Segmented } from "@/shared/ui";
import { buildView, FILTERS, filterCounts, GROUPS, reviewPool, teamUsernames, type Filter, type GroupBy } from "../lib/board";
import { MrSection } from "./MrSection";

const TILE: Record<Filter, string> = { all: "t-all", waiting: "t-wait", threads: "t-threads", ready: "t-ready" };

/** MR board: GitLab merge requests waiting for the user, the user's own and the team's. Read-only. */
export default function Mrs({ setup, profile, onOpenSettings }: { setup: SetupState; profile: DashProfile; onOpenSettings: () => void }) {
  const m = useT().mrs;
  const [roster, setRoster] = useState<Roster | null>(null);
  const [teamId, setTeamId] = useStored<number | null>("worklog.mrs.team", null);
  const [filter, setFilter] = useStored<Filter>("worklog.mrs.filter", "all");
  const [group, setGroup] = useStored<GroupBy>("worklog.mrs.group", "none");
  const [board, setBoard] = useState<MrBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    api.rosterLoad().then(setRoster).catch(() => setRoster({ teams: [], people: [] }));
  }, []);

  // A team that was deleted since the last visit is the same as "everyone".
  const team = roster && teamId !== null && roster.teams.some((t) => t.id === teamId) ? teamId : null;
  const people = useMemo(() => (roster ? teamUsernames(roster, team) : []), [roster, team]);
  const peopleKey = people.join(",");
  // A developer reviews the team's developers and the lead without being asked; other profiles only what names them.
  const pool = useMemo(() => (profile === "dev" && roster ? reviewPool(roster, team) : null), [profile, roster, team]);

  const load = useCallback((force: boolean) => {
    const mark = ++seq.current;
    setLoading(true);
    api.gitlabMrBoard(peopleKey ? peopleKey.split(",") : [], force)
      .then((b) => { if (mark === seq.current) { setBoard(b); setError(""); } })
      .catch((e) => { if (mark === seq.current) setError(m.loadFailed(String(e))); })
      .finally(() => { if (mark === seq.current) setLoading(false); });
  }, [peopleKey, m]);

  useEffect(() => {
    if (setup.gitlab && roster) load(false);
  }, [setup.gitlab, roster, load]);

  const views = useMemo(() => (board ? buildView(board, people, filter, group, pool) : []), [board, people, filter, group, pool]);
  const tasks = useMemo(() => new Map((board?.tasks ?? []).map((t) => [t.key, t])), [board]);

  if (!setup.gitlab) {
    return (
      <div className="mrs-setup">
        <p className="muted">{m.needGitlab}</p>
        <Button variant="primary" onClick={onOpenSettings}>{m.openSettings}</Button>
      </div>
    );
  }

  const counts = board ? filterCounts(board, people, pool) : null;

  return (
    <section className="mrs">
      <div className="mrs-tiles" role="group">
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`mrs-tile ${TILE[f]} ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            <span className="mrs-tile-l">{m.filters[f]}</span>
            <b>{counts ? counts[f] : "–"}</b>
          </button>
        ))}
      </div>

      <div className="mrs-top">
        <label className="mrs-team">
          <span>{m.team}<InfoTip>{m.teamTip}</InfoTip></span>
          <select value={team ?? ""} onChange={(e) => setTeamId(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">{m.allPeople}</option>
            {roster?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="mrs-group">
          <span>{m.group}<InfoTip>{m.releaseTip}</InfoTip></span>
          <Segmented size="small" value={group} onChange={setGroup} options={GROUPS.map((g) => ({ value: g, label: m.groups[g] }))} />
        </div>
        <span className="mrs-sync muted">
          {loading ? <><i className="spin" />{m.loading}</> : board && m.updatedAt(new Date(board.cachedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}
        </span>
        <Button size="small" disabled={loading} onClick={() => load(true)}>{m.refresh}</Button>
      </div>

      {roster && people.length === 0 && <p className="muted mrs-note">{m.noTeam}</p>}
      {error && <div className="error">{error}</div>}

      {views.map((v) => <MrSection key={v.id} view={v} group={group} tasks={tasks} />)}
    </section>
  );
}
