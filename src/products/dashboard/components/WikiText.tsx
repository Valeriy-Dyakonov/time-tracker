import { Fragment, useMemo, type ReactNode } from "react";
import { api } from "@/shared/api";
import { parseMarkdown } from "../lib/markdown";
import { parseWiki, type Block, type Inline } from "../lib/wiki";

/** Jira wiki markup (or markdown notes) rendered as React elements, never as HTML; links open in the system browser. */
export function WikiText(props: {
  text: string;
  isKey: (k: string) => boolean;
  onKey: (k: string) => void;
  format?: "wiki" | "md";
  /** "doc": roomier typography for reading a whole document. */
  variant?: "doc";
}) {
  const { text, isKey, onKey, format = "wiki", variant } = props;
  const blocks = useMemo(() => (format === "md" ? parseMarkdown(text, isKey) : parseWiki(text, isKey)), [text, isKey, format]);
  const line = (parts: Inline[]): ReactNode[] =>
    parts.map((x, n) => {
      switch (x.t) {
        case "text": return <Fragment key={n}>{x.v}</Fragment>;
        case "b": return <strong key={n}>{line(x.v)}</strong>;
        case "i": return <em key={n}>{line(x.v)}</em>;
        case "u": return <u key={n}>{line(x.v)}</u>;
        case "s": return <s key={n}>{line(x.v)}</s>;
        case "br": return <br key={n} />;
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
  /** A flat list with depths -> nested <ul>/<ol>: each deeper run goes inside the item before it. */
  const list = (b: Extract<Block, { t: "ul" | "ol" }>, key: number): ReactNode => {
    const depth = b.depth ?? b.items.map(() => 0);
    const kinds = b.kinds ?? b.items.map(() => b.t);
    let i = 0;
    const level = (d: number, Tag: "ul" | "ol", k: number): ReactNode => {
      const lis: ReactNode[] = [];
      while (i < b.items.length && depth[i] >= d) {
        const at = i++;
        const kids = i < b.items.length && depth[i] > d ? level(d + 1, kinds[i], i) : null;
        lis.push(<li key={at}>{line(b.items[at])}{kids}</li>);
      }
      return <Tag key={k}>{lis}</Tag>;
    };
    return level(0, b.t, key);
  };
  return (
    <div className={variant === "doc" ? "wiki wiki-doc" : "wiki"}>
      {blocks.map((b, n) => {
        switch (b.t) {
          case "p": return <p key={n}>{b.lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{line(l)}</Fragment>)}</p>;
          case "h": return <h5 key={n} className={`wiki-h${b.level}`}>{line(b.v)}</h5>;
          case "ul":
          case "ol": return list(b, n);
          case "hr": return <hr key={n} />;
          case "code": return <pre key={n}><code>{b.v}</code></pre>;
          case "quote": return <blockquote key={n}>{b.lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{line(l)}</Fragment>)}</blockquote>;
          case "table":
            return (
              <div key={n} className="wiki-table">
                <table>
                  <tbody>
                    {b.rows.map((r, k) => (
                      <tr key={k}>{r.map((c, j) => (c.head ? <th key={j}>{line(c.v)}</th> : <td key={j}>{line(c.v)}</td>))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
