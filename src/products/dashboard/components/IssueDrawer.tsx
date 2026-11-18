import { useCallback, useEffect, useState, type ReactNode } from "react";
import { dateShort, useT } from "@/i18n";
import { api } from "@/shared/api";
import { useStored } from "@/shared/hooks/useStored";
import { localDate } from "@/shared/lib/dates";
import type { DashIssue, DashPerson, DashRelated, IssueDetail } from "@/shared/types";
import { Button } from "@/shared/ui";
import { stageOf } from "../lib/stages";
import { Avatar } from "./Avatar";
import { ago } from "./IssueCard";
import { WikiText } from "./WikiText";

const day = (ms: number | null) => (ms ? dateShort(localDate(new Date(ms))) : "");

const DEFAULT_WIDTH = 780;
const MIN_WIDTH = 420;
/** Keep a strip of the board visible to click back to it. */
const maxWidth = () => Math.max(MIN_WIDTH, window.innerWidth - 80);
const clampWidth = (w: number) => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, w)));

/** Drag the left edge to resize; the width is remembered, a double click restores the default. */
function useDrawerWidth(): [number, (e: React.PointerEvent) => void, () => void] {
  const [width, setWidth] = useStored("worklog.dashboard.drawerWidth", DEFAULT_WIDTH);
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setWidth(clampWidth(window.innerWidth - ev.clientX));
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    document.body.classList.add("resizing");
  };
  return [clampWidth(width), start, () => setWidth(DEFAULT_WIDTH)];
}

/**
 * Side panel to read a task without leaving the app: people, epic, description, links, comments.
 * Task keys inside open in the same panel; "Back" returns to the previous one.
 */
export function IssueDrawer(props: { issueKey: string; context: Map<string, DashIssue>; projects: Set<string>; onClose: () => void }) {
  const m = useT().dashboard;
  const d = m.detail;
  const [stack, setStack] = useState<string[]>([props.issueKey]);
  const key = stack[stack.length - 1];
  const [data, setData] = useState<IssueDetail | null>(null);
  const [error, setError] = useState("");
  const { onClose } = props;
  const [width, startResize, resetWidth] = useDrawerWidth();

  useEffect(() => { setStack([props.issueKey]); }, [props.issueKey]);
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

  const open = useCallback((k: string) => setStack((s) => (s[s.length - 1] === k ? s : [...s, k])), []);
  const isKey = useCallback((k: string) => props.projects.has(k.split("-")[0]) || props.context.has(k), [props.projects, props.context]);
  const rel = (k: string | null) => (k ? props.context.get(k) : undefined);
  const stage = data ? stageOf(data) : null;

  return (
    <div className="drawer-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-label={key} style={{ width }}>
        <div className="drawer-resize" role="separator" aria-orientation="vertical" title={d.resize} onPointerDown={startResize} onDoubleClick={resetWidth} />
        <header className="drawer-h">
          {stack.length > 1 && <button className="drawer-icon" title={d.back} aria-label={d.back} onClick={() => setStack((s) => s.slice(0, -1))}>←</button>}
          <span className="drawer-key-h">{data?.issueType && <span className="dash-type">{data.issueType}</span>}<b>{key}</b></span>
          {data && <span className={`dash-stage s-${stage}`}>{data.status}</span>}
          <span className="spacer" />
          <Button size="small" onClick={() => void api.openIssue(key)}>{d.openInJira} ↗</Button>
          <button className="drawer-icon" aria-label={d.close} title={d.close} onClick={onClose}>×</button>
        </header>

        <div className="drawer-body">
          {!data && !error && <div className="drawer-skeleton"><i /><i /><i /></div>}
          {error && <div className="error">{d.failed(error)}</div>}
          {data && (
            <>
              <h2 className="drawer-title">{data.summary}</h2>
              <div className="drawer-chips">
                {data.priority && <span className="chip">{data.priority}</span>}
                <span className="chip">{data.projectName}</span>
                {data.fixVersions.map((v) => <span key={v} className="chip">{d.release}: {v}</span>)}
                {data.components.map((c) => <span key={c} className="chip">{c}</span>)}
                {data.labels.map((l) => <span key={l} className="chip soft">#{l}</span>)}
              </div>

              {(data.epic || (data.parent && data.parent !== data.epic)) && (
                <div className="drawer-parents">
                  {data.epic && <Parent label={d.epic} k={data.epic} sum={rel(data.epic)?.summary} onOpen={open} />}
                  {data.parent && data.parent !== data.epic && <Parent label={d.parent} k={data.parent} sum={rel(data.parent)?.summary} onOpen={open} />}
                </div>
              )}

              <section className="drawer-card drawer-people">
                <Person label={m.assignee} p={data.assignee} m={m} />
                {data.people.map((p) => <Person key={p.field + p.person.name} label={p.field} p={p.person} m={m} />)}
                <Person label={m.reporter} p={data.reporter} m={m} />
                <div className="drawer-dates">
                  {data.due && <span>{d.due}: <b>{dateShort(data.due)}</b></span>}
                  <span>{d.created}: <b>{day(data.created)}</b></span>
                  <span>{d.updated}: <b>{ago(data.updated, m)}</b></span>
                </div>
              </section>

              <Section title={d.description}>
                {data.description ? <WikiText text={data.description} isKey={isKey} onKey={open} /> : <p className="muted">{d.noDescription}</p>}
              </Section>

              {data.subtasks.length > 0 && <Section title={`${d.subtasks} · ${data.subtasks.length}`}><Related items={data.subtasks} onOpen={open} /></Section>}
              {data.linked.length > 0 && <Section title={`${d.links} · ${data.linked.length}`}><Related items={data.linked} onOpen={open} grouped /></Section>}

              <Section title={d.comments(data.commentTotal)}>
                {data.commentTotal > data.comments.length && <p className="muted">{d.olderHidden(data.comments.length, data.commentTotal)}</p>}
                {data.comments.length === 0 && <p className="muted">{d.noComments}</p>}
                <div className="comments">
                  {[...data.comments].reverse().map((c, n) => (
                    <article key={n} className="comment">
                      <Avatar name={c.author} size={30} />
                      <div className="comment-body">
                        <header><b>{c.author}</b><span className="muted" title={day(c.created)}>{ago(c.created, m)}</span></header>
                        <WikiText text={c.body} isKey={isKey} onKey={open} />
                      </div>
                    </article>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="drawer-section"><h4>{title}</h4>{children}</section>
);

function Person({ label, p, m }: { label: string; p: DashPerson | null; m: ReturnType<typeof useT>["dashboard"] }) {
  return (
    <div className="person">
      {p ? <Avatar name={p.display} size={28} /> : <span className="avatar empty" aria-hidden />}
      <span className="person-text">
        <small>{label}</small>
        <span className={p?.me ? "me" : p ? "" : "none"}>{p ? p.display : m.nobody}{p?.me && <em> · {m.you}</em>}</span>
      </span>
    </div>
  );
}

function Parent({ label, k, sum, onOpen }: { label: string; k: string; sum?: string; onOpen: (k: string) => void }) {
  return (
    <button className="parent" onClick={() => onOpen(k)}>
      <small>{label}</small>
      <b>{k}</b>
      {sum && <span>{sum}</span>}
      <span className="parent-go">→</span>
    </button>
  );
}

function Related({ items, onOpen, grouped }: { items: DashRelated[]; onOpen: (k: string) => void; grouped?: boolean }) {
  const groups = new Map<string, DashRelated[]>();
  for (const r of items) groups.set(grouped ? r.relation : "", [...(groups.get(grouped ? r.relation : "") ?? []), r]);
  return (
    <div className="related">
      {[...groups.entries()].map(([relation, rs]) => (
        <div key={relation} className="related-group">
          {relation && <small className="related-rel">{relation}</small>}
          {rs.map((r) => (
            <button key={r.key} className={`related-item s-${stageOf(r)}`} onClick={() => onOpen(r.key)}>
              <b>{r.key}</b>
              <span className="related-sum">{r.summary}</span>
              <span className={`dash-stage s-${stageOf(r)}`}>{r.status}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
