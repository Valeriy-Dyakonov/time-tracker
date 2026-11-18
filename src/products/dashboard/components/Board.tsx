import { useState } from "react";
import { useT } from "@/i18n";
import { keyColor } from "@/shared/ui";
import { isOldDone, type Grouping, type Lane } from "../lib/groups";
import { stageOf, type Stage } from "../lib/stages";
import { IssueCard, Who } from "./IssueCard";

/**
 * Jira-like board: stages as columns left to right, epics/releases as swimlanes across them.
 * The done column folds; inside it, tasks closed more than a week ago are tucked away.
 */
export function Board(props: {
  lanes: Lane[];
  columns: Stage[];
  by: Grouping;
  today: string;
  now: number;
  doneFolded: boolean;
  onToggleDone: () => void;
  onOpen: (key: string) => void;
}) {
  const m = useT().dashboard;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showOld, setShowOld] = useState(false);
  const laneId = (l: Lane) => l.id ?? "\u0000none";
  const toggle = (id: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const total = (s: Stage) => props.lanes.reduce((n, l) => n + l.cells[s].length, 0);
  const template = props.columns.map((s) => (s === "done" && props.doneFolded ? "120px" : "minmax(230px, 1fr)")).join(" ");
  const laneTitle = (l: Lane) => (l.id ?? (props.by === "epic" ? m.noEpic : props.by === "release" ? m.noRelease : m.allTasks));

  return (
    <div className="board-scroll">
      <div className="board" style={{ gridTemplateColumns: template }}>
        {props.columns.map((s) => (
          <div key={s} className={`board-col-h s-${s}`}>
            <b>{m.stages[s]}</b>
            <span className="dash-n">{total(s)}</span>
            {s === "done" && (
              <button className="board-fold" title={props.doneFolded ? m.showDone : m.hideDone} onClick={props.onToggleDone}>
                {props.doneFolded ? "»" : "«"}
              </button>
            )}
          </div>
        ))}

        {props.lanes.map((l) => {
          const id = laneId(l);
          const closed = collapsed.has(id);
          return (
            <div key={id} className="board-lane" style={{ gridColumn: "1 / -1", gridTemplateColumns: template }}>
              <div className="board-lane-h" style={{ gridColumn: "1 / -1" }}>
                <button className="board-caret" aria-expanded={!closed} onClick={() => toggle(id)}>{closed ? "▸" : "▾"}</button>
                {props.by === "epic" && l.id && <span className="dot" style={{ background: keyColor(l.id) }} />}
                {props.by === "epic" && l.id ? (
                  <button className="dash-head-key" onClick={() => props.onOpen(l.id!)}>{l.id}</button>
                ) : (
                  <b>{laneTitle(l)}</b>
                )}
                {l.head && <span className="muted dash-type">{l.head.issueType}</span>}
                {l.head && <span className="dash-head-sum" title={l.head.summary}>{l.head.summary}</span>}
                {l.head && <span className={`dash-stage s-${stageOf(l.head)}`}>{l.head.status}</span>}
                {l.head && <span className="board-lane-who"><Who p={l.head.assignee} m={m} /></span>}
                <span className="spacer" />
                <span className="dash-n">{m.tasks(l.total)}</span>
              </div>
              {!closed && props.columns.map((s) => {
                const cards = l.cells[s];
                if (s === "done" && props.doneFolded) return <div key={s} className="board-cell folded">{cards.length || ""}</div>;
                const recent = s === "done" && !showOld ? cards.filter((i) => !isOldDone(i, props.now)) : cards;
                const old = cards.length - recent.length;
                return (
                  <div key={s} className={`board-cell s-${s}`}>
                    {recent.map((i) => <IssueCard key={i.key} i={i} today={props.today} now={props.now} onOpen={props.onOpen} />)}
                    {old > 0 && <button className="board-more" onClick={() => setShowOld(true)}>{m.olderDone(old)}</button>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
