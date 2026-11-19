import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import type { JiraTransition } from "@/shared/types";
import { Button } from "@/shared/ui";
import { stageOf } from "../lib/stages";

const MENU_WIDTH = 320;

/**
 * Moves the task along its Jira workflow: lists what Jira allows now, asks for the required values Jira offers,
 * and changes the status only after the user confirms.
 */
export function StatusMove({ issueKey, status, stage, onMoved }: { issueKey: string; status: string; stage: string; onMoved: (to: string) => void }) {
  const m = useT().dashboard.detail.move;
  const [list, setList] = useState<JiraTransition[] | null>(null);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<JiraTransition | null>(null);
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  const [end, setEnd] = useState(false);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) reset(); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  async function toggle() {
    if (open) return reset();
    // Near the right edge the menu opens leftwards so it is not cut off.
    setEnd((box.current?.getBoundingClientRect().left ?? 0) + MENU_WIDTH > window.innerWidth - 16);
    setOpen(true);
    setError("");
    setList(null);
    try {
      setList(await api.jiraTransitions(issueKey));
    } catch (e) {
      setError(m.failed(String(e)));
    }
  }

  function reset() {
    setOpen(false);
    setChosen(null);
    setValues({});
    setError("");
  }

  async function apply() {
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      await api.jiraTransition(issueKey, chosen.id, chosen.fields.map((f) => ({ id: f.id, values: values[f.id] ?? [] })));
      const to = chosen.to;
      reset();
      onMoved(to);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const ready = chosen && chosen.fields.every((f) => (values[f.id] ?? []).length > 0);
  return (
    <span className="sel" ref={box}>
      <button className={`sel-btn s-${stage} ${open ? "open" : ""}`} title={m.title} aria-haspopup="listbox" aria-expanded={open} onClick={() => void toggle()}>
        <i className="sel-dot" aria-hidden />
        <span>{status}</span>
        <svg className="sel-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className={`sel-menu ${end ? "end" : ""}`} role="listbox">
          {!chosen && (
            <>
              <div className="sel-opt current" role="option" aria-selected>
                <i className={`sel-dot s-${stage}`} aria-hidden />
                <span className="sel-name">{status}</span>
                <svg className="sel-check" width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="m3 7.5 2.6 2.6L11 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              {!list && !error && <p className="sel-info">{m.loading}</p>}
              {list && list.length === 0 && <p className="sel-info">{m.none}</p>}
              {list && list.length > 0 && <div className="sel-sep" />}
              {list?.map((t) => (
                <button key={t.id} role="option" aria-selected={false} className="sel-opt" disabled={t.needsJira} title={t.needsJira ? m.onlyJiraTip : t.name} onClick={() => setChosen(t)}>
                  <i className={`sel-dot s-${stageOf({ status: t.to, category: t.category })}`} aria-hidden />
                  <span className="sel-name">{t.to}</span>
                  {t.needsJira && <span className="sel-note">{m.onlyJira}</span>}
                </button>
              ))}
            </>
          )}
          {chosen && (
            <div className="sel-confirm">
              <p>{m.confirm(issueKey, status, chosen.to)}</p>
              {chosen.fields.map((f) => (
                <label key={f.id} className="sel-field">
                  <small>{f.name}</small>
                  <select
                    multiple={f.multiple}
                    value={f.multiple ? values[f.id] ?? [] : values[f.id]?.[0] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.id]: Array.from(e.target.selectedOptions, (o) => o.value).filter(Boolean) })}
                  >
                    {!f.multiple && <option value="">{m.pick}</option>}
                    {f.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              ))}
              <div className="row">
                <Button variant="primary" size="small" disabled={busy || !ready} onClick={() => void apply()}>{m.apply}</Button>
                <Button variant="ghost" size="small" disabled={busy} onClick={() => setChosen(null)}>{m.cancel}</Button>
              </div>
            </div>
          )}
          {error && <p className="status err sel-info">{error}</p>}
        </div>
      )}
    </span>
  );
}
