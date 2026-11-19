import { dateShort } from "@/i18n/format";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import type { Mr, MrTask } from "@/shared/types";
import { initials } from "@/products/team/lib/roster";
import { factsOf, isStale } from "../lib/board";

const hhmm = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "today at 14:05", "yesterday at ...", else the date. */
function when(ms: number, m: ReturnType<typeof useT>["mrs"]): string {
  const d = new Date(ms);
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (ymd(d) === ymd(now)) return m.today(hhmm(d));
  if (ymd(d) === ymd(yesterday)) return m.yesterday(hhmm(d));
  return `${dateShort(ymd(d))} ${hhmm(d)}`;
}

/** One merge request: title, author, what it waits for and who reviews it. `task` is shown when the list is not grouped by it. */
export function MrCard({ mr, task, compact }: { mr: Mr; task?: MrTask; compact?: boolean }) {
  const m = useT().mrs;
  const f = factsOf(mr);
  const stale = isStale(mr, Date.now());
  const approved = new Set(mr.approvedBy.map((a) => a.username));
  const reviewers = [...mr.reviewers, ...mr.approvedBy.filter((a) => !mr.reviewers.some((r) => r.username === a.username))];
  const tone = mr.conflicts ? "bad" : f.threads ? "warn" : f.ready ? "good" : "";

  return (
    <article className={`mr ${compact ? "compact" : ""} ${stale ? "stale" : ""} ${tone}`}>
      <div className="mr-main">
        <div className="mr-head">
          <button type="button" className="mr-title" title={`${mr.title}\n${m.open}`} onClick={() => void api.openLink(mr.url).catch(() => {})}>{mr.title}</button>
          {mr.draft && <span className="mr-tag">{m.draft}</span>}
        </div>
        <div className="mr-meta">
          <span className="mr-author"><span className="mr-ava">{initials(mr.author.name)}</span>{mr.author.name}</span>
          <code title={m.branchTip}>{mr.project}!{mr.iid}</code>
          {mr.targetBranch && <span className="mr-branch" title={`${mr.sourceBranch} → ${mr.targetBranch}`}>→ {mr.targetBranch}</span>}
          <span className="muted">{m.updated(when(mr.updated, m))}</span>
        </div>
        {!compact && (
          <div className="mr-tags">
            {mr.conflicts && <span className="mr-tag bad">{m.conflicts}</span>}
            {f.threads && <span className="mr-tag warn">{m.threads}</span>}
            {f.ready && <span className="mr-tag good">{m.ready}</span>}
            {stale && <span className="mr-tag" title={m.staleTip}>{m.stale}</span>}
            {mr.comments > 0 && <span className="mr-tag">{m.comments(mr.comments)}</span>}
            {mr.detailed && !mr.draft && <span className="mr-tag">{m.approvals(mr.approvedBy.length, mr.approvalsLeft)}</span>}
            {task && <span className="mr-tag task" title={task.summary}><b>{task.key}</b> {task.summary}</span>}
          </div>
        )}
      </div>
      {!compact && (
        <div className="mr-people" aria-label={m.reviewers}>
          {reviewers.length === 0 && <span className="muted">{m.noReviewers}</span>}
          {reviewers.map((r) => (
            <span key={r.username} className={`mr-rev ${approved.has(r.username) ? "ok" : ""}`} title={`${r.name} - ${approved.has(r.username) ? m.approved : m.waitingFor}`}>
              <span className="mr-ava">{initials(r.name)}</span>
              {approved.has(r.username) && <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.5l3 3 6-6.5" /></svg>}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
