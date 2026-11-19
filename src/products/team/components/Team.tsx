import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import type { Roster } from "@/shared/types";
import { Button, InfoTip } from "@/shared/ui";
import {
  addPerson, addTeam, attachAccount, setAbsences, buildTree, detachAccount, emptyRoster, nextId, removePerson, removeTeam, renameTeam, unassigned, updatePerson,
  type TeamNode,
} from "../lib/roster";
import { PersonEditor } from "./PersonEditor";
import { PersonChip, TeamTree } from "./TeamTree";

/** Team roster: an org chart of departments and teams with people; the selected person is edited on the right. Every change is saved on its own. */
export default function Team() {
  const m = useT().team;
  const [roster, setRoster] = useState<Roster>(emptyRoster);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    api.rosterLoad().then((r) => { setRoster(r); setLoaded(true); }).catch((e) => { setError(m.loadFailed(String(e))); });
    // Once: a language switch must not reload (and overwrite) unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blank = roster.teams.some((t) => !t.name.trim()) || roster.people.some((p) => !p.name.trim());

  // Saved a moment after the last change, so typing a name is one save and not one per letter.
  useEffect(() => {
    if (!loaded || !dirty.current || blank) return;
    const id = setTimeout(() => {
      api.rosterSave(roster).then(() => { setError(""); setSaved(true); }).catch((e) => setError(m.saveFailed(String(e))));
    }, 400);
    return () => clearTimeout(id);
  }, [roster, loaded, blank, m]);

  const edit = (f: (r: Roster) => Roster) => {
    dirty.current = true;
    setSaved(false);
    setRoster(f);
  };

  const newPerson = (teamId: number | null) => {
    setSelected(nextId(roster.people));
    edit((r) => addPerson(r, teamId, ""));
  };
  const askRemove = (n: TeamNode) => {
    if (window.confirm(m.confirmTeam(n.team.name || m.teamName))) edit((r) => removeTeam(r, n.team.id));
  };

  const person = roster.people.find((p) => p.id === selected);
  const free = unassigned(roster);

  return (
    <section className="tm">
      <header className="tm-head">
        <p className="muted">{m.intro}<InfoTip>{m.tip}</InfoTip></p>
        <div className="tm-actions">
          <Button variant="primary" onClick={() => edit((r) => addTeam(r, null, ""))}>+ {m.addTeam}</Button>
          <Button onClick={() => newPerson(null)}>+ {m.addPersonFull}</Button>
          {saved && !blank && <span className="tm-saved">{m.saved}</span>}
        </div>
        {blank && <p className="muted">{m.fillNames}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </header>

      <div className={`tm-layout ${person ? "with-editor" : ""}`}>
        <div className="tm-chart">
          {loaded && !roster.teams.length && !free.length && <p className="muted tm-empty">{m.empty}</p>}
          <TeamTree
            nodes={buildTree(roster)}
            selected={selected}
            onSelect={setSelected}
            onRename={(id, name) => edit((r) => renameTeam(r, id, name))}
            onAddPerson={newPerson}
            onAddSub={(id) => edit((r) => addTeam(r, id, ""))}
            onRemove={askRemove}
          />
          {free.length > 0 && (
            <div className="tm-free">
              <h4 className="tm-sub">{m.unassigned}</h4>
              <p className="muted">{m.unassignedHint}</p>
              <div className="tm-card-people">{free.map((p) => <PersonChip key={p.id} person={p} selected={selected === p.id} onSelect={() => setSelected(p.id)} />)}</div>
            </div>
          )}
        </div>
        {person && (
          <PersonEditor
            key={person.id}
            person={person}
            roster={roster}
            onPerson={(patch) => edit((r) => updatePerson(r, person.id, patch))}
            onAttach={(system, extId) => edit((r) => attachAccount(r, person.id, { system, extId }))}
            onDetach={(system, extId) => edit((r) => detachAccount(r, person.id, { system, extId }))}
            onAbsences={(f) => edit((r) => setAbsences(r, person.id, f))}
            onRemove={() => { edit((r) => removePerson(r, person.id)); setSelected(null); }}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </section>
  );
}
