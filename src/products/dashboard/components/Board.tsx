import { useT } from "@/i18n";
import type { DashIssue } from "@/shared/types";
import { keyColor } from "@/shared/ui";
import { epicBlocks, type EpicBlock } from "../lib/groups";
import { stageOf, type Stage } from "../lib/stages";
import { IssueCard } from "./IssueCard";

/**
 * One board like Jira: stage columns left to right, separated by dashed lines down the whole height.
 * Inside a column, tasks of one epic form a block: the epic once on top, its tasks nested under an arrow.
 */
export function Board(props: {
  columns: Stage[];
  cells: Record<string, DashIssue[]>;
  context: Map<string, DashIssue>;
  types: Set<string>;
  today: string;
  now: number;
  onOpen: (key: string) => void;
}) {
  const m = useT().dashboard;
  return (
    <div className="board-scroll">
      <div className="board" style={{ gridTemplateColumns: `repeat(${props.columns.length}, minmax(250px, 1fr))` }}>
        {props.columns.map((s) => {
          const cards = props.cells[s] ?? [];
          return (
            <section key={s} className={`board-col s-${s}`}>
              <header className="board-col-h">
                <span className="board-col-dot" />
                <b>{m.stages[s]}</b>
                <span className="board-col-n">{cards.length}</span>
              </header>
              <div className="board-col-body">
                {cards.length === 0 && <div className="board-empty">—</div>}
                {epicBlocks(cards, props.context, props.types).map((b) => (
                  <Block key={b.id ?? "\u0000"} b={b} today={props.today} now={props.now} onOpen={props.onOpen} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Block({ b, today, now, onOpen }: { b: EpicBlock; today: string; now: number; onOpen: (key: string) => void }) {
  const cards = b.issues.map((i) => <IssueCard key={i.key} i={i} today={today} now={now} onOpen={onOpen} />);
  if (!b.id) return <div className="board-loose">{cards}</div>;
  return (
    <div className="epic-block" style={{ ["--epic" as string]: keyColor(b.id) }}>
      <button className="epic-head" title={b.head?.summary ?? b.id} onClick={() => onOpen(b.id!)}>
        <span className="epic-type">{b.head?.issueType ?? "Epic"}</span>
        <b>{b.id}</b>
        <span className="epic-sum">{b.head?.summary}</span>
        {b.head && <span className={`epic-status s-${stageOf(b.head)}`}>{b.head.status}</span>}
      </button>
      <div className="epic-tasks">{cards}</div>
    </div>
  );
}
