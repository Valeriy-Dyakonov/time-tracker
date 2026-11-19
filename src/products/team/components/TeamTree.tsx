import { useT } from "@/i18n";
import type { RosterPerson } from "@/shared/types";
import { dateShort } from "@/i18n/format";
import { localDate } from "@/shared/lib/dates";
import { absenceNow, groupPeople, initials, type TeamNode } from "../lib/roster";

/** A person on a team card: avatar, name, role and a dot per attached system. */
export function PersonChip({ person, selected, onSelect }: { person: RosterPerson; selected: boolean; onSelect: () => void }) {
  const m = useT().team;
  const systems = new Set(person.accounts.map((a) => a.system));
  const away = absenceNow(person, localDate(new Date()));
  return (
    <button type="button" className={`tm-p ${selected ? "on" : ""}`} onClick={onSelect}>
      <span className={`tm-ava r-${person.role}`}>{initials(person.name)}</span>
      <span className="tm-p-main">
        <b>{person.name || m.personName}</b>
        <small>{m.roles[person.role]}</small>
        {away && (
          <em className={`tm-away k-${away.absence.kind} ${away.current ? "now" : "soon"}`}>
            {away.current ? m.absence.until(m.absence.kinds[away.absence.kind], dateShort(away.absence.to)) : m.absence.since(m.absence.kinds[away.absence.kind], dateShort(away.absence.from))}
          </em>
        )}
      </span>
      <span className="tm-dots" aria-hidden>
        {(["jira", "gitlab", "matrix"] as const).map((s) => <i key={s} className={`s-${s} ${systems.has(s) ? "on" : ""}`} title={m.systems[s]} />)}
      </span>
    </button>
  );
}

interface Actions {
  selected: number | null;
  onSelect: (id: number) => void;
  onRename: (teamId: number, name: string) => void;
  onAddPerson: (teamId: number) => void;
  onAddSub: (teamId: number) => void;
  onRemove: (node: TeamNode) => void;
}

function Branch({ node, a }: { node: TeamNode; a: Actions }) {
  const m = useT().team;
  const { team } = node;
  return (
    <li>
      <div className="tm-card">
        <div className="tm-card-head">
          <input value={team.name} placeholder={m.teamName} aria-label={m.teamName} onChange={(e) => a.onRename(team.id, e.target.value)} />
          <button type="button" title={m.addPerson} aria-label={m.addPerson} onClick={() => a.onAddPerson(team.id)}>
            <svg viewBox="0 0 16 16"><circle cx="7" cy="5.5" r="2.5" /><path d="M2.5 13c.4-2.5 2.2-3.7 4.5-3.7M12 8.5v4M10 10.5h4" /></svg>
          </button>
          <button type="button" title={m.addSub} aria-label={m.addSub} onClick={() => a.onAddSub(team.id)}>
            <svg viewBox="0 0 16 16"><rect x="5.5" y="2" width="5" height="4" rx="1" /><path d="M8 6v3M3.5 9h9M3.5 9v2.5M12.5 9v2.5" /><rect x="1.5" y="11.5" width="4" height="3" rx=".8" /><rect x="10.5" y="11.5" width="4" height="3" rx=".8" /></svg>
          </button>
          <button type="button" className="del" title={m.remove} aria-label={m.remove} onClick={() => a.onRemove(node)}>
            <svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>
          </button>
        </div>
        <div className="tm-card-people">
          {groupPeople(node.people).map((g) => (
            <div key={g.group} className={`tm-group g-${g.group}`}>
              <span className="tm-group-name">{m.groups[g.group]}</span>
              {g.people.map((p) => <PersonChip key={p.id} person={p} selected={a.selected === p.id} onSelect={() => a.onSelect(p.id)} />)}
            </div>
          ))}
          {!node.people.length && <span className="tm-nobody">{m.nobody}</span>}
        </div>
      </div>
      {node.children.length > 0 && <ul>{node.children.map((c) => <Branch key={c.team.id} node={c} a={a} />)}</ul>}
    </li>
  );
}

/** The roster as an org chart: parent above, sub-teams below, joined by lines. */
export function TeamTree({ nodes, ...a }: { nodes: TeamNode[] } & Actions) {
  return (
    <div className="tm-scroll">
      <ul className="tm-tree">{nodes.map((n) => <Branch key={n.team.id} node={n} a={a} />)}</ul>
    </div>
  );
}
