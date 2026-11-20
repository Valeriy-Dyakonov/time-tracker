import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n";
import { useStored } from "@/shared/hooks/useStored";
import type { Mr, Roster } from "@/shared/types";
import { Button, CopyButton, InfoTip } from "@/shared/ui";
import { buildMessage, mrId, recipientsOf, SHARE_SYSTEMS, type ShareSystem } from "../lib/share";

const STEPS = ["mrs", "system", "people", "review"] as const;

/**
 * Hands the user's MRs over as a message: choose the MRs, the messenger, the people, then review the text written
 * for that messenger. Nothing is sent: the user copies the text and posts it.
 */
export function ShareMrs({ mrs, roster, myGitlab, onClose }: { mrs: Mr[]; roster: Roster | null; myGitlab: string; onClose: () => void }) {
  const m = useT().mrs.share;
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(mrs.filter((x) => !x.draft).map(mrId)));
  const [system, setSystem] = useStored<ShareSystem>("worklog.mrs.share.system", "matrix");
  const [people, setPeople] = useStored<number[]>("worklog.mrs.share.people", []);
  const [query, setQuery] = useState("");
  // Empty = the default line; the user can write their own, it is remembered.
  const [line, setLine] = useStored("worklog.mrs.share.line", "");
  const [text, setText] = useState("");

  useEffect(() => {
    // Capture phase: Esc closes this window only.
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);

  const everyone = useMemo(() => (roster ? recipientsOf(roster, myGitlab) : []), [roster, myGitlab]);
  const chosenMrs = mrs.filter((x) => picked.has(mrId(x)));
  const chosenPeople = everyone.filter((p) => people.includes(p.id));
  const shown = everyone.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  const toggleMr = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const togglePerson = (id: number, on: boolean) => setPeople(on ? [...new Set([...people, id])] : people.filter((x) => x !== id));

  const write = (l: string) => setText(buildMessage(system, chosenMrs, chosenPeople, l.trim() || m.defaultLine));

  function go(to: number) {
    // The text is written when the review step opens, so it always matches the choices; edits stay until the user steps back.
    if (to === 3) write(line);
    setStep(to);
  }

  return createPortal(
    <div className="share-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="share-win" role="dialog" aria-modal="true" aria-label={m.title}>
        <header className="share-head">
          <h3>{m.title}</h3>
          <button className="note-close" onClick={onClose} title={m.close} aria-label={m.close}>×</button>
        </header>
        <ol className="share-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "on" : i < step ? "done" : ""}><span>{i < step ? "✓" : i + 1}</span>{m.steps[s]}</li>
          ))}
        </ol>

        <div className="share-body">
          {step === 0 && (
            <>
              <div className="share-bulk">
                <span className="muted">{m.picked(chosenMrs.length, mrs.length)}</span>
                <Button variant="ghost" size="small" onClick={() => setPicked(new Set(mrs.map(mrId)))}>{m.all}</Button>
                <Button variant="ghost" size="small" onClick={() => setPicked(new Set())}>{m.none}</Button>
              </div>
              <ul className="share-list">
                {mrs.map((x) => (
                  <li key={mrId(x)}>
                    <label>
                      <input type="checkbox" checked={picked.has(mrId(x))} onChange={(e) => toggleMr(mrId(x), e.target.checked)} />
                      <span className="share-main">
                        <span className="share-title">{x.title}</span>
                        <small className="muted">{x.project}!{x.iid}{x.draft ? ` · ${m.draft}` : ""}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step === 1 && (
            <div className="share-systems" role="radiogroup" aria-label={m.steps.system}>
              {SHARE_SYSTEMS.map((s) => (
                <label key={s} className={`share-system ${system === s ? "on" : ""}`}>
                  <input type="radio" name="share-system" checked={system === s} onChange={() => setSystem(s)} />
                  <b>{m.systems[s].name}</b>
                  <span className="muted">{m.systems[s].desc}</span>
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <>
              <div className="share-bulk">
                <input className="share-search" value={query} placeholder={m.search} onChange={(e) => setQuery(e.target.value)} />
                <span className="muted">{m.chosenPeople(chosenPeople.length)}</span>
              </div>
              {everyone.length === 0 && <p className="muted">{m.noPeople}</p>}
              <ul className="share-list">
                {shown.map((p) => (
                  <li key={p.id}>
                    <label>
                      <input type="checkbox" checked={people.includes(p.id)} onChange={(e) => togglePerson(p.id, e.target.checked)} />
                      <span className="share-main">
                        <span className="share-title">{p.name}</span>
                        {system === "matrix" && <small className={p.matrixId ? "muted" : "share-warn"}>{p.matrixId ?? m.noMatrix}</small>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="muted share-hint">{m.skipPeople}</p>
            </>
          )}

          {step === 3 && (
            <>
              <label className="share-line">
                <span className="field-label">{m.lineLabel}<InfoTip>{m.lineTip}</InfoTip></span>
                <input value={line} placeholder={m.defaultLine} onChange={(e) => { setLine(e.target.value); write(e.target.value); }} />
              </label>
              <p className="muted share-hint">{m.reviewHint(m.systems[system].name)}</p>
              <textarea className="share-text" rows={Math.min(16, Math.max(8, text.split("\n").length + 1))} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
            </>
          )}
        </div>

        <footer className="share-foot">
          <Button variant="ghost" onClick={() => (step === 0 ? onClose() : go(step - 1))}>{step === 0 ? m.cancel : m.back}</Button>
          {step < 3 ? (
            <Button variant="primary" disabled={step === 0 && chosenMrs.length === 0} onClick={() => go(step + 1)}>{m.next}</Button>
          ) : (
            <span className="share-copy">
              <CopyButton text={() => text} label={m.copy} title={m.copyTitle} />
              <Button variant="primary" onClick={onClose}>{m.done}</Button>
            </span>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
