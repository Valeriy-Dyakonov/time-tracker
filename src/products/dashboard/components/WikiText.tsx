import { Fragment, useMemo } from "react";
import { api } from "@/shared/api";
import { parseWiki, type Inline } from "../lib/wiki";

/** Jira wiki markup rendered as React elements (never as HTML); links open in the system browser. */
export function WikiText({ text, isKey, onKey }: { text: string; isKey: (k: string) => boolean; onKey: (k: string) => void }) {
  const blocks = useMemo(() => parseWiki(text, isKey), [text, isKey]);
  const line = (parts: Inline[]) =>
    parts.map((x, n) => {
      switch (x.t) {
        case "text": return <Fragment key={n}>{x.v}</Fragment>;
        case "b": return <strong key={n}>{x.v}</strong>;
        case "i": return <em key={n}>{x.v}</em>;
        case "code": return <code key={n}>{x.v}</code>;
        case "mention": return <span key={n} className="wiki-mention">@{x.v}</span>;
        case "key": return <button key={n} className="wiki-key" onClick={() => onKey(x.v)}>{x.v}</button>;
        case "link":
          return (
            <a key={n} href={x.href} title={x.href} onClick={(e) => { e.preventDefault(); void api.openLink(x.href); }}>
              {x.v}
            </a>
          );
      }
    });
  return (
    <div className="wiki">
      {blocks.map((b, n) => {
        switch (b.t) {
          case "p": return <p key={n}>{b.lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{line(l)}</Fragment>)}</p>;
          case "h": return <h5 key={n} className={`wiki-h${b.level}`}>{line(b.v)}</h5>;
          case "ul": return <ul key={n}>{b.items.map((it, k) => <li key={k}>{line(it)}</li>)}</ul>;
          case "ol": return <ol key={n}>{b.items.map((it, k) => <li key={k}>{line(it)}</li>)}</ol>;
          case "code": return <pre key={n}><code>{b.v}</code></pre>;
          case "quote": return <blockquote key={n}>{b.lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{line(l)}</Fragment>)}</blockquote>;
        }
      })}
    </div>
  );
}
