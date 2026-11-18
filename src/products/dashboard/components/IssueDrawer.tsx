import { useEffect, useState, type ReactNode } from "react";
import { dateShort, useT } from "@/i18n";
import { api } from "@/shared/api";
import { localDate } from "@/shared/lib/dates";
import type { DashIssue, DashRelated, IssueDetail } from "@/shared/types";
import { Button } from "@/shared/ui";
import { stageOf } from "../lib/stages";
import { ago, Who } from "./IssueCard";

const day = (ms: number | null) => (ms ? dateShort(localDate(new Date(ms))) : "");

/**
 * Side panel to read a task without leaving the app: people, epic, description, comments, links.
 * Related keys open in the same panel; "Back" returns to the previous one.
 */
export function IssueDrawer({ issueKey, context, onClose }: { issueKey: string; context: Map<string, DashIssue>; onClose: () => void }) {
  const m = useT().dashboard;
  const d = m.detail;
  const [stack, setStack] = useState<string[]>([issueKey]);
  const key = stack[stack.length - 1];
  const [data, setData] = useState<IssueDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { setStack([issueKey]); }, [issueKey]);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    api.jiraIssueDetail(key).then((x) => live && setData(x)).catch((e) => live && setError(String(e)));
    return () => { live = false; };
  }, [key]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const open = (k: string) => setStack((s) => [...s, k]);
  const rel = (k: string | null) => (k ? context.get(k) : undefined);

  return (
    <div className="drawer-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-label={key}>
        <header className="drawer-h">
          {stack.length > 1 && <Button variant="ghost" size="small" onClick={() => setStack((s) => s.slice(0, -1))}>← {d.back}</Button>}
          <b>{key}</b>
          {data && <span className={`dash-stage s-${stageOf(data)}`}>{data.status}</span>}
          <span className="spacer" />
          <Button size="small" onClick={() => void api.openIssue(key)}>{d.openInJira}</Button>
          <button className="drawer-x" aria-label={d.close} title={d.close} onClick={onClose}>×</button>
        </header>
        <div className="drawer-body">
          {!data && !error && <p className="muted">{d.loading}</p>}
          {error && <div className="error">{d.failed(error)}</div>}
          {data && (
            <>
              <h3>{data.summary}</h3>
              <p className="muted drawer-sub">{[data.issueType, data.priority, data.projectName].filter(Boolean).join(" · ")}</p>

              <dl className="drawer-facts">
                <dt>{m.assignee}</dt><dd><Who p={data.assignee} m={m} /></dd>
                {data.people.map((p) => <Fact key={p.field + p.person.name} k={p.field}><Who p={p.person} m={m} /></Fact>)}
                <dt>{m.reporter}</dt><dd><Who p={data.reporter} m={m} /></dd>
                {data.epic && <Fact k={d.epic}><KeyLink k={data.epic} sum={rel(data.epic)?.summary} onOpen={open} /></Fact>}
                {data.parent && data.parent !== data.epic && <Fact k={d.parent}><KeyLink k={data.parent} sum={rel(data.parent)?.summary} onOpen={open} /></Fact>}
                {data.fixVersions.length > 0 && <Fact k={d.release}>{data.fixVersions.join(", ")}</Fact>}
                {data.components.length > 0 && <Fact k={d.components}>{data.components.join(", ")}</Fact>}
                {data.labels.length > 0 && <Fact k={d.labels}>{data.labels.join(", ")}</Fact>}
                {data.due && <Fact k={d.due}>{dateShort(data.due)}</Fact>}
                <Fact k={d.created}>{day(data.created)}</Fact>
                <Fact k={d.updated}>{ago(data.updated, m)}</Fact>
              </dl>

              <h4>{d.description}</h4>
              {data.description ? <div className="drawer-text">{data.description}</div> : <p className="muted">{d.noDescription}</p>}

              {data.subtasks.length > 0 && <RelatedList title={d.subtasks} items={data.subtasks} onOpen={open} />}
              {data.linked.length > 0 && <RelatedList title={d.links} items={data.linked} onOpen={open} />}

              <h4>{d.comments(data.commentTotal)}</h4>
              {data.commentTotal > data.comments.length && <p className="muted">{d.olderHidden(data.comments.length, data.commentTotal)}</p>}
              {data.comments.length === 0 && <p className="muted">{d.noComments}</p>}
              {[...data.comments].reverse().map((c, n) => (
                <article key={n} className="drawer-comment">
                  <header><b>{c.author}</b><span className="muted">{ago(c.created, m)}</span></header>
                  <div className="drawer-text">{c.body}</div>
                </article>
              ))}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

const Fact = ({ k, children }: { k: string; children: ReactNode }) => (<><dt>{k}</dt><dd>{children}</dd></>);

function KeyLink({ k, sum, onOpen }: { k: string; sum?: string; onOpen: (k: string) => void }) {
  return <span><button className="drawer-key" onClick={() => onOpen(k)}>{k}</button>{sum && <span className="muted"> {sum}</span>}</span>;
}

function RelatedList({ title, items, onOpen }: { title: string; items: DashRelated[]; onOpen: (k: string) => void }) {
  return (
    <>
      <h4>{title}</h4>
      <ul className="drawer-rel">
        {items.map((r) => (
          <li key={r.relation + r.key}>
            {r.relation && <span className="muted">{r.relation} </span>}
            <button className="drawer-key" onClick={() => onOpen(r.key)}>{r.key}</button>
            <span> {r.summary}</span>
            <span className="muted"> · {r.status}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
