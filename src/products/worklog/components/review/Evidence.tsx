import type { DayPlan, Evidence as Item } from "@/shared/types";
import IssueLink from "@/shared/components/IssueLink";
import { clock } from "../report/Live";
import { SOURCE_ORDER, sourceLabel } from "../common/sources";
import { useT } from "@/i18n";

function groupBySource(list: Item[]): [string, Item[]][] {
  const m = new Map<string, Item[]>();
  for (const e of list) m.set(e.source, [...(m.get(e.source) ?? []), e]);
  return [...m.entries()].sort((x, y) => SOURCE_ORDER.indexOf(x[0] as Item["source"]) - SOURCE_ORDER.indexOf(y[0] as Item["source"]));
}

/** Everything found for a day, grouped by tool; chat messages show the room and the addressee. */
export function Evidence({ d }: { d: DayPlan }) {
  const m = useT().review.evidence;
  if (d.evidence.length === 0) return null;
  return (
    <details className="evidence">
      <summary>{m.title(d.eventCount)}</summary>
      <div className="ev-groups">
        {groupBySource(d.evidence).map(([src, list]) => (
          <section className={`ev-group s-${src}`} key={src}>
            <h6><i />{sourceLabel(src)}<span>{list.length}</span></h6>
            <ul>{list.map((e, i) => <EvidenceLine key={i} e={e} />)}</ul>
          </section>
        ))}
      </div>
    </details>
  );
}

function EvidenceLine({ e }: { e: Item }) {
  const m = useT().review.evidence;
  const where = e.context && e.context !== e.to ? (e.source === "matrix" ? m.inRoom(e.context) : e.context) : "";
  return (
    <li>
      <time>{clock(e.ts).slice(0, 5)}</time>
      <span className="ev-key">{e.key ? <IssueLink k={e.key} /> : <span className="muted">—</span>}</span>
      <span className="ev-body">
        <span className="ev-text">{e.text}</span>
        {(e.to || where) && (
          <span className="ev-ctx">
            {e.to && <span className="ev-to" title={m.toTitle}>→ {e.to}</span>}
            {where && <span>{where}</span>}
          </span>
        )}
      </span>
    </li>
  );
}
