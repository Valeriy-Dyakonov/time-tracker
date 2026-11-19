import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import type { AbsenceKind, AccountSystem, MyAccount, RosterAbsence, Roster, RosterPerson, RosterRole } from "@/shared/types";
import { Button, Card } from "@/shared/ui";
import { myAccounts } from "../lib/lookup";
import { localDate } from "@/shared/lib/dates";
import { ABSENCE_KINDS, initials, newAbsence, ROLES, SYSTEMS } from "../lib/roster";
import { AccountSearch } from "./AccountSearch";

/** Side panel for the selected person: name, role, team and the accounts in each system. */
export function PersonEditor({ person, roster, onPerson, onAttach, onDetach, onAbsences, onRemove, onClose }: {
  person: RosterPerson;
  roster: Roster;
  onPerson: (patch: Partial<Pick<RosterPerson, "name" | "role" | "teamId">>) => void;
  onAttach: (system: AccountSystem, extId: string) => void;
  onDetach: (system: AccountSystem, extId: string) => void;
  onAbsences: (f: (list: RosterAbsence[]) => RosterAbsence[]) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const m = useT().team;
  // Own accounts come from the connections already set up, so for the user there is nothing to search for.
  const [mine, setMine] = useState<MyAccount[] | null>(null);
  useEffect(() => { myAccounts().then(setMine).catch(() => setMine([])); }, []);
  const isMe = !!mine && person.accounts.some((a) => mine.some((x) => x.system === a.system && x.extId.toLowerCase() === a.extId.toLowerCase()));
  const fillMine = () => {
    for (const a of mine ?? []) onAttach(a.system, a.extId);
    const name = mine?.find((a) => a.system === "jira" || a.name)?.name;
    if (!person.name.trim() && name) onPerson({ name });
  };
  return (
    <Card className="tm-editor">
      <div className="tm-editor-head">
        <span className={`tm-ava r-${person.role}`}>{initials(person.name)}</span>
        <input className="tm-name" autoFocus={!person.name} value={person.name} placeholder={m.personName} aria-label={m.personName} onChange={(e) => onPerson({ name: e.target.value })} />
        <button type="button" className="tm-x" title={m.close} aria-label={m.close} onClick={onClose}>×</button>
      </div>
      <div className="tm-editor-row">
        <label>
          <span>{m.role}</span>
          <select value={person.role} onChange={(e) => onPerson({ role: e.target.value as RosterRole })}>
            {ROLES.map((r) => <option key={r} value={r}>{m.roles[r]}</option>)}
          </select>
        </label>
        <label>
          <span>{m.moveTo}</span>
          <select value={person.teamId ?? ""} onChange={(e) => onPerson({ teamId: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">{m.noTeam}</option>
            {roster.teams.map((t) => <option key={t.id} value={t.id}>{t.name || "…"}</option>)}
          </select>
        </label>
      </div>
      <h4 className="tm-sub">{m.accounts}{isMe && <span className="tm-me">{m.you}</span>}</h4>
      {mine === null ? (
        <p className="muted"><span className="spin" /> {m.loadingMine}</p>
      ) : isMe ? (
        <>
          <p className="muted tm-note">{m.youHint}</p>
          {person.accounts.map((a) => (
            <span key={a.system + a.extId} className={`tm-chip s-${a.system}`}>
              <i>{m.systems[a.system]}</i> {a.extId}
              <button type="button" title={m.account.detach} aria-label={m.account.detach} onClick={() => onDetach(a.system, a.extId)}>×</button>
            </span>
          ))}
          {mine.some((x) => !person.accounts.some((a) => a.system === x.system && a.extId.toLowerCase() === x.extId.toLowerCase())) && (
            <Button size="small" onClick={fillMine}>{m.addMine}</Button>
          )}
        </>
      ) : (
        <>
          {!person.accounts.length && mine.length > 0 && <Button size="small" onClick={fillMine}>{m.thisIsMe}</Button>}
          {/* Keyed by person: the search box starts over with the next person's name. */}
          {SYSTEMS.map((s) => (
            <AccountSearch
              key={`${person.id}-${s}`}
              system={s}
              personId={person.id}
              name={person.name}
              roster={roster}
              accounts={person.accounts}
              onAttach={(extId) => onAttach(s, extId)}
              onDetach={(extId) => onDetach(s, extId)}
            />
          ))}
        </>
      )}
      <h4 className="tm-sub">{m.absence.title}</h4>
      {person.absences.map((a, i) => {
        const set = (patch: Partial<RosterAbsence>) => onAbsences((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div key={i} className="tm-away-row">
            <select value={a.kind} aria-label={m.absence.title} onChange={(e) => set({ kind: e.target.value as AbsenceKind })}>
              {ABSENCE_KINDS.map((k) => <option key={k} value={k}>{m.absence.kinds[k]}</option>)}
            </select>
            <input type="date" value={a.from} aria-label={m.absence.from} onChange={(e) => set({ from: e.target.value })} />
            <input type="date" value={a.to} min={a.from} aria-label={m.absence.to} onChange={(e) => set({ to: e.target.value })} />
            <button type="button" className="tm-x" title={m.absence.remove} aria-label={m.absence.remove} onClick={() => onAbsences((l) => l.filter((_, j) => j !== i))}>×</button>
            {a.from && a.to && a.to < a.from && <span className="error tm-away-bad">{m.absence.badWhen}</span>}
          </div>
        );
      })}
      <Button size="small" onClick={() => onAbsences((l) => [...l, newAbsence(localDate(new Date()))])}>+ {m.absence.add}</Button>
      <Button variant="ghost" size="small" className="tm-danger" onClick={onRemove}>{m.removePerson}</Button>
    </Card>
  );
}
