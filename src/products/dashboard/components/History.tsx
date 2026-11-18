import { useEffect, useState } from "react";
import { dateFull, useT, weekdayShort } from "@/i18n";
import { api } from "@/shared/api";
import { isoWeekday, localDate } from "@/shared/lib/dates";
import type { DashIssue } from "@/shared/types";
import { Segmented } from "@/shared/ui";
import { normalizeData } from "../lib/normalize";
import type { Profile } from "../lib/stages";
import { IssueCard } from "./IssueCard";

const SPANS = [7, 30, 90] as const;
type Span = (typeof SPANS)[number];

/**
 * Closed tasks, kept off the board: read from Jira only when the user opens this block,
 * then grouped by the day they were closed.
 */
export function History({ profile, filter, onOpen }: { profile: Profile; filter: (list: DashIssue[]) => DashIssue[]; onOpen: (key: string) => void }) {
  const m = useT().dashboard;
  const [open, setOpen] = useState(false);
  const [span, setSpan] = useState<Span>(7);
  const [state, setState] = useState<{ key: string; list?: DashIssue[]; error?: string } | null>(null);
  const want = `${profile}:${span}`;

  useEffect(() => {
    if (!open || state?.key === want) return;
    let live = true;
    setState({ key: want });
    api.jiraDashboard(profile, span)
      .then((d) => live && setState({ key: want, list: normalizeData(d).issues }))
      .catch((e) => live && setState({ key: want, error: String(e) }));
    return () => { live = false; };
  }, [open, want, profile, span, state?.key]);

  const list = filter(state?.list ?? []).sort((a, b) => (b.resolved ?? 0) - (a.resolved ?? 0));
  const byDay = new Map<string, DashIssue[]>();
  for (const i of list) {
    const d = i.resolved ? localDate(new Date(i.resolved)) : "";
    byDay.set(d, [...(byDay.get(d) ?? []), i]);
  }
  const now = Date.now();
  const today = localDate(new Date());

  return (
    <details className="dash-history" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <b>{m.history.title}</b>
        {state?.list && <span className="board-col-n">{list.length}</span>}
        <span className="muted">{m.history.hint}</span>
      </summary>
      {open && (
        <div className="dash-history-body">
          <Segmented size="small" value={String(span)} onChange={(v) => setSpan(Number(v) as Span)}
            options={SPANS.map((d) => ({ value: String(d), label: m.history.span(d) }))} />
          {!state?.list && !state?.error && <p className="muted">{m.loading}</p>}
          {state?.error && <div className="error">{m.failed(state.error)}</div>}
          {state?.list && list.length === 0 && <p className="muted">{m.history.empty}</p>}
          {[...byDay.entries()].map(([d, items]) => (
            <section key={d} className="dash-history-day">
              <h5>{d ? `${weekdayShort(isoWeekday(d))}, ${dateFull(d)}` : "—"}<span className="board-col-n">{items.length}</span></h5>
              <div className="dash-cards">{items.map((i) => <IssueCard key={i.key} i={i} today={today} now={now} onOpen={onOpen} />)}</div>
            </section>
          ))}
        </div>
      )}
    </details>
  );
}
