import { Button, InfoTip } from "@/shared/ui";
import { useState, type ReactElement } from "react";
import { useT } from "@/i18n";
import type { MrTask, Roster } from "@/shared/types";
import type { Bucket, GroupBy, SectionView } from "../lib/board";
import { MrCard } from "./MrCard";
import { ShareMrs } from "./ShareMrs";

const ICON: Record<SectionView["id"], ReactElement> = {
  review: <svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  mine: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4.2 4-6 8-6s7.2 1.8 8 6" /></svg>,
  team: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><circle cx="17.5" cy="9.5" r="2.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 14.5c3 0 4.9 1.5 5.5 4.5" /></svg>,
};

function BucketHead({ b }: { b: Bucket }) {
  if (b.kind === "all" || b.kind === "rest") return null;
  if (b.kind === "task") {
    return (
      <div className="mrs-bucket-head task">
        <b>{b.title}</b>
        <span className="mrs-bucket-name">{b.task?.summary}</span>
        {b.task?.status && <span className="mr-tag">{b.task.status}</span>}
        <span className="mrs-bucket-n">{b.mrs.length}</span>
      </div>
    );
  }
  return (
    <div className="mrs-bucket-head release">
      <svg viewBox="0 0 16 16" aria-hidden>{b.kind === "release" ? <path d="M2 8.6V2.8h5.8l6 6-5.4 5.4-6.4-5.6zM5.2 5.2h.1" /> : <path d="M4 2.5v11M4 6c0 3 7 1 7 5M11 13.5V11" />}</svg>
      <b>{b.title}</b>
      <span className="mrs-bucket-n">{b.mrs.length}</span>
    </div>
  );
}

/** One section of the board (for review / mine / team): groups of live MRs, then the drafts folded away. */
export function MrSection({ view, group, tasks, share, aiReady }: { view: SectionView; group: GroupBy; tasks: Map<string, MrTask>; share?: { roster: Roster | null; myGitlab: string }; aiReady: boolean }) {
  const m = useT().mrs;
  const [sharing, setSharing] = useState(false);
  const all = view.buckets.flatMap((b) => b.mrs).concat(view.drafts);
  const green = all.filter((mr) => mr.pipeline === "success").length;
  const text = m.sections[view.id];
  const rest = group === "release" ? m.noRelease : m.noTask;
  const taskOf = (key: string | null) => (key ? tasks.get(key) : undefined);

  return (
    <section className={`mrs-section s-${view.id}`}>
      <h3>
        <span className="mrs-ic">{ICON[view.id]}</span>
        {text.title}
        <span className="mrs-count">{view.total}</span>
        {view.id !== "review" && all.length > 0 && <span className="mrs-green" title={m.greenOf(green, all.length)}>{green}/{all.length}</span>}
        {text.tip && <InfoTip>{text.tip}</InfoTip>}
        {share && all.length > 0 && <Button className="mrs-share" size="small" onClick={() => setSharing(true)}>{m.share.open}</Button>}
      </h3>
      {sharing && share && <ShareMrs mrs={all} roster={share.roster} myGitlab={share.myGitlab} onClose={() => setSharing(false)} />}
      {view.total === 0 && <p className="muted mrs-empty-note">{text.empty}</p>}
      {view.buckets.map((b) => (
        <div key={b.id} className={`mrs-bucket ${b.kind}`}>
          {b.kind === "rest" ? <div className="mrs-bucket-head rest">{rest}<span className="mrs-bucket-n">{b.mrs.length}</span></div> : <BucketHead b={b} />}
          <div className="mrs-cards">
            {b.mrs.map((mr) => <MrCard key={`${mr.projectId}:${mr.iid}`} mr={mr} task={group === "task" ? undefined : taskOf(mr.task)} aiReady={aiReady} />)}
          </div>
        </div>
      ))}
      {view.drafts.length > 0 && (
        <details className="mrs-drafts">
          <summary>{m.drafts}<span className="mrs-count">{view.drafts.length}</span></summary>
          <div className="mrs-cards">
            {view.drafts.map((mr) => <MrCard key={`${mr.projectId}:${mr.iid}`} mr={mr} compact aiReady={aiReady} />)}
          </div>
        </details>
      )}
    </section>
  );
}
