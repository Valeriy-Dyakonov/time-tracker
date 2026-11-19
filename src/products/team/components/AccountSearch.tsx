import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import type { AccountSystem, PersonHit, Roster, RosterAccount } from "@/shared/types";
import { searchPeople } from "../lib/lookup";
import { ownerOf } from "../lib/roster";

/** Accounts of one person in one system: what is attached, and a search that attaches more. */
export function AccountSearch({ system, personId, name, roster, accounts, onAttach, onDetach }: {
  system: AccountSystem;
  personId: number;
  name: string;
  roster: Roster;
  accounts: RosterAccount[];
  onAttach: (extId: string) => void;
  onDetach: (extId: string) => void;
}) {
  const m = useT().team;
  const mine = accounts.filter((a) => a.system === system);
  // Starts with the person's name: for a new person the first suggestions are already there.
  const [query, setQuery] = useState(mine.length ? "" : name);
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); setState("idle"); return; }
    const mark = ++seq.current;
    setState("loading");
    const id = setTimeout(() => {
      searchPeople(system, q)
        .then((r) => { if (mark === seq.current) { setHits(r); setState("idle"); } })
        .catch((e) => { if (mark === seq.current) { setHits([]); setError(String(e)); setState("error"); } });
    }, 300);
    return () => clearTimeout(id);
  }, [query, system]);

  const pick = (h: PersonHit) => {
    onAttach(h.extId);
    setQuery("");
    setHits([]);
    setOpen(false);
  };

  return (
    <div className={`tm-sys s-${system}`}>
      <div className="tm-sys-head"><i />{m.systems[system]}</div>
      <div className="tm-sys-body">
        {mine.map((a) => (
          <span key={a.extId} className="tm-chip">
            {a.extId}
            <button type="button" title={m.account.detach} aria-label={m.account.detach} onClick={() => onDetach(a.extId)}>×</button>
          </span>
        ))}
        <div className="tm-find">
          <input
            value={query}
            placeholder={m.account.search(m.systems[system])}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) pick(hits[0]); }}
          />
          {state === "loading" && <span className="spin tm-spin" />}
          {open && query.trim().length >= 2 && (
            <div className="tm-hits" role="listbox">
              {state === "error" && <div className="tm-hit-note error">{error}</div>}
              {state !== "error" && !hits.length && state === "idle" && <div className="tm-hit-note">{m.account.none}</div>}
              {hits.map((h) => {
                const owner = ownerOf(roster, system, h.extId);
                const taken = owner && owner.id !== personId ? owner.name : null;
                return (
                  <button key={h.extId} type="button" role="option" aria-selected={false} className="tm-hit" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}>
                    <b>{h.name}</b>
                    <span>{h.extId}{h.detail && h.detail !== h.extId ? ` · ${h.detail}` : ""}</span>
                    {taken && <em>{m.account.taken(taken)}</em>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
