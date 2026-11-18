import { useT } from "@/i18n";
import type { DashIssue } from "@/shared/types";
import { keyColor } from "@/shared/ui";
import type { Group, Grouping } from "../lib/groups";
import { stageOf, type Stage } from "../lib/stages";
import { IssueCard, Who } from "./IssueCard";

/** Groups as sections: an epic with its status and people, a release, or a stage. */
export function GroupList(props: { groups: Group[]; by: Grouping; today: string; now: number; onOpen: (key: string) => void }) {
  const m = useT().dashboard;
  const title = (g: Group) => {
    if (props.by === "stage") return m.stages[g.id as Stage];
    if (g.id === null) return props.by === "epic" ? m.noEpic : m.noRelease;
    return g.id;
  };
  return (
    <div className={`dash-groups by-${props.by}`}>
      {props.groups.map((g) => (
        <section key={g.id ?? "none"} className={`dash-group ${props.by === "stage" ? `s-${g.id}` : ""}`}>
          <header>
            {props.by === "epic" && g.id && <span className="dot" style={{ background: keyColor(g.id) }} />}
            {props.by === "epic" && g.id ? (
              <button className="dash-head-key" onClick={() => props.onOpen(g.id!)}>{g.id}</button>
            ) : (
              <b>{title(g)}</b>
            )}
            {g.head && <span className="dash-head-sum" title={g.head.summary}>{g.head.summary}</span>}
            {g.head && <span className={`dash-stage s-${stageOf(g.head)}`}>{g.head.status}</span>}
            <span className="spacer" />
            <StageCounts issues={g.issues} />
          </header>
          {g.head && (
            <div className="dash-head-people">
              <span><span className="muted">{m.assignee}:</span> <Who p={g.head.assignee} m={m} /></span>
              {g.head.people.map((p) => <span key={p.field + p.person.name}><span className="muted">{p.field}:</span> <Who p={p.person} m={m} /></span>)}
            </div>
          )}
          <div className="dash-cards">
            {g.issues.map((i) => <IssueCard key={i.key} i={i} today={props.today} now={props.now} onOpen={props.onOpen} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/** How many tasks of the group are at each stage: the shape of an epic or release at a glance. */
function StageCounts({ issues }: { issues: DashIssue[] }) {
  const m = useT().dashboard;
  const counts = new Map<Stage, number>();
  for (const i of issues) counts.set(stageOf(i), (counts.get(stageOf(i)) ?? 0) + 1);
  return (
    <span className="dash-counts" title={m.tasks(issues.length)}>
      {[...counts.entries()].map(([s, n]) => <span key={s} className={`dash-count s-${s}`} title={m.stages[s]}>{n}</span>)}
    </span>
  );
}
