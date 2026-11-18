import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { WikiText } from "../WikiText";
import type { TaskNote } from "./useTaskDev";

/** The task's markdown notes, one opened at a time; each is read only when opened. */
export function NotesPanel({ notes, isKey, onKey }: { notes: TaskNote[]; isKey: (k: string) => boolean; onKey: (k: string) => void }) {
  const m = useT().dashboard.tools;
  const [open, setOpen] = useState<string | null>(notes[0]?.id ?? null);
  const [texts, setTexts] = useState<Record<string, string | { error: string }>>({});

  useEffect(() => {
    const n = notes.find((x) => x.id === open);
    if (!n || texts[n.id] !== undefined) return;
    n.read()
      .then((t) => setTexts((p) => ({ ...p, [n.id]: t })))
      .catch((e) => setTexts((p) => ({ ...p, [n.id]: { error: String(e) } })));
  }, [open, notes, texts]);

  return (
    <div className="tool-panel docs">
      {notes.map((n) => {
        const t = texts[n.id];
        const name = n.path.split("/").pop() ?? n.path;
        return (
          <section key={n.id} className={`doc ${open === n.id ? "open" : ""}`}>
            <button className="doc-h" onClick={() => setOpen(open === n.id ? null : n.id)}>
              <span className="doc-caret">›</span>
              <b>{name}</b>
              <span className="muted doc-path" title={`${n.where} · ${n.path}`}>{n.where} · {n.path.slice(0, -name.length)}</span>
              <span className="spacer" />
              {n.date && <span className="muted">{n.date.slice(0, 10)}</span>}
            </button>
            {open === n.id && (
              <div className="doc-body">
                {t === undefined && <p className="muted">{m.loading}</p>}
                {typeof t === "object" && <div className="error">{t.error}</div>}
                {typeof t === "string" && <WikiText text={t} isKey={isKey} onKey={onKey} format="md" />}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
