import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import { Button } from "@/shared/ui";
import { noteTitle } from "../../lib/markdown";
import { WikiText } from "../WikiText";
import { readNote, type TaskNote } from "./useTaskDev";

type Text = string | { error: string };

const fileName = (path: string) => path.split("/").pop() ?? path;

function RepoLink({ url }: { url: string | null }) {
  const m = useT().dashboard.tools;
  if (!url) return null;
  return (
    <a className="doc-link" href={url} title={url} onClick={(e) => { e.preventDefault(); e.stopPropagation(); void api.openLink(url); }}>
      {m.docOpenRepo} ↗
    </a>
  );
}

/**
 * The task's markdown notes as a list (title from the note, file and where it lives, link to the repository);
 * one opens in a reading window. Texts are read up front so the titles are known.
 */
export function NotesPanel({ notes, onReload, isKey, onKey }: {
  notes: TaskNote[];
  onReload: () => void;
  isKey: (k: string) => boolean;
  onKey: (k: string) => void;
}) {
  const m = useT().dashboard.tools;
  const [texts, setTexts] = useState<Record<string, Text>>({});
  const [open, setOpen] = useState<TaskNote | null>(null);

  useEffect(() => {
    let live = true;
    for (const n of notes) {
      readNote(n)
        .then((t) => live && setTexts((p) => ({ ...p, [n.id]: t })))
        .catch((e) => live && setTexts((p) => ({ ...p, [n.id]: { error: String(e) } })));
    }
    return () => { live = false; };
  }, [notes]);

  return (
    <div className="tool-panel docs">
      <div className="docs-bar">
        <span className="muted">{notes.length ? m.docsFound(notes.length) : m.docsNone}</span>
        <Button size="small" onClick={onReload}>↻ {m.docsReload}</Button>
      </div>
      {notes.length === 0 && <p className="muted docs-hint">{m.docsNoneHint}</p>}
      {notes.map((n) => {
        const t = texts[n.id];
        const title = typeof t === "string" ? noteTitle(t) : null;
        return (
          <button key={n.id} className="doc-row" onClick={() => setOpen(n)}>
            <span className="doc-icon" aria-hidden>
              <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
            </span>
            <span className="doc-main">
              <b className="doc-title">{title ?? fileName(n.path)}</b>
              <span className="muted doc-meta" title={`${n.where} · ${n.path}`}>
                {title && <>{fileName(n.path)} · </>}{n.where}{n.date && <> · {n.date.slice(0, 10)}</>}
              </span>
              {typeof t === "object" && <span className="dev-err">{t.error}</span>}
            </span>
            <RepoLink url={n.url} />
          </button>
        );
      })}
      {open && <NoteWindow note={open} text={texts[open.id]} isKey={isKey} onKey={onKey} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** A note to read: over the whole window, closed by Esc, the backdrop or ×. */
function NoteWindow({ note, text, isKey, onKey, onClose }: {
  note: TaskNote;
  text: Text | undefined;
  isKey: (k: string) => boolean;
  onKey: (k: string) => void;
  onClose: () => void;
}) {
  const m = useT().dashboard.tools;
  useEffect(() => {
    // Capture phase: Esc closes this window only, not the task panel under it.
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);
  const title = typeof text === "string" ? noteTitle(text) : null;

  // Portal: the task panel's transform would otherwise make "fixed" relative to the panel, not the window.
  return createPortal(
    <div className="note-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="note-win" role="dialog" aria-modal="true" aria-label={title ?? note.path}>
        <header className="note-head">
          <div className="note-head-main">
            <h3>{title ?? fileName(note.path)}</h3>
            <span className="muted doc-meta" title={note.path}>{note.where} · {note.path}</span>
          </div>
          <RepoLink url={note.url} />
          <button className="note-close" onClick={onClose} title={m.close} aria-label={m.close}>×</button>
        </header>
        <div className="note-body">
          {text === undefined && <p className="muted">{m.loading}</p>}
          {typeof text === "object" && <div className="error">{text.error}</div>}
          {typeof text === "string" && <WikiText text={text} isKey={isKey} onKey={(k) => { onClose(); onKey(k); }} format="md" variant="doc" />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
