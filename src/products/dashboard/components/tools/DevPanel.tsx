import { useState, type ReactNode } from "react";
import { useT } from "@/i18n";
import { api, errorText } from "@/shared/api";
import { useStored } from "@/shared/hooks/useStored";
import type { TaskGit, TaskMrs } from "@/shared/types";
import { Button, Segmented } from "@/shared/ui";
import { commitId, mrId, notesOf, type TaskDev } from "./useTaskDev";

const day = (iso: string) => iso.slice(0, 10);

type Group = "services" | "list";

/** Items in groups by a name (the service = the GitLab project or the repository), in the order first met. */
function grouped<T>(items: T[], by: (x: T) => string): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const x of items) out.set(by(x), [...(out.get(by(x)) ?? []), x]);
  return [...out.entries()];
}

/**
 * What is known about the task's development: merge requests in GitLab, commits in the local repositories,
 * and where exactly the app looked, so "nothing found" can be told from "not looked".
 * For a task with subtasks (or an epic) it shows theirs too, each marked with its task, grouped by service.
 */
export function DevPanel({ dev, onSettings, onReload }: { dev: TaskDev; onSettings?: () => void; onReload: () => void }) {
  const m = useT().dashboard.dev;
  const { git, mrs } = dev;
  const [openMr, setOpenMr] = useState<string | null>(null);
  const [openCommit, setOpenCommit] = useState<string | null>(null);
  const [group, setGroup] = useStored<Group>("worklog.dashboard.devGroup", "services");
  const withTasks = (dev.children?.length ?? 0) > 0;
  const taskOf = (id: string) => (withTasks ? dev.owner?.[id] : undefined);

  /** Either one list or a block per service. */
  const layout = <T,>(items: T[], by: (x: T) => string, card: (x: T) => ReactNode): ReactNode =>
    group === "list"
      ? items.map(card)
      : grouped(items, by).map(([name, list]) => (
          <div key={name} className="dev-group">
            <h6>{name}<span className="tool-n">{list.length}</span></h6>
            {list.map(card)}
          </div>
        ));

  const mrCard = (r: TaskMrs["mrs"][number]) => {
    const id = `${r.projectId}!${r.iid}`;
    const task = taskOf(mrId(r));
    return (
      <article key={id} className={`mr st-${r.state}`}>
        <button className="mr-h" onClick={() => setOpenMr(openMr === id ? null : id)}>
          <span className="mr-state">{m.states[r.state as keyof typeof m.states] ?? r.state}</span>
          {task && <span className="mr-task">{task}</span>}
          <span className="mr-title">{r.title}</span>
          <span className="spacer" />
          <span className="muted">{[r.commits.length > 0 && m.commitsN(r.commits.length), r.files.length > 0 && m.filesN(r.files.length)].filter(Boolean).join(" · ")}</span>
        </button>
        <div className="mr-meta muted">
          <span>{r.project}!{r.iid}</span>
          <code>{r.sourceBranch}</code>→<code>{r.targetBranch}</code>
          <span>{r.author}</span>
          <span>{day(r.updated)}</span>
          <a href={r.webUrl} onClick={(e) => { e.preventDefault(); void api.openLink(r.webUrl); }}>{m.openMr} ↗</a>
        </div>
        {openMr === id && r.commits.length > 0 && (
          <ul className="mr-commits">
            {r.commits.map((c) => <li key={c.short}><code>{c.short}</code> {c.title} <span className="muted">· {c.author}, {day(c.date)}</span></li>)}
          </ul>
        )}
        {openMr === id && r.files.length > 0 && (
          <details className="mr-files">
            <summary>{m.filesN(r.files.length)}</summary>
            <ul className="commit-files">{r.files.map((f) => <li key={f}><code>{f}</code></li>)}</ul>
          </details>
        )}
      </article>
    );
  };

  const commitCard = (c: TaskGit["commits"][number]) => {
    const task = taskOf(commitId(c.hash));
    return (
      <article key={c.hash} className="commit">
        <button className="commit-h" onClick={() => setOpenCommit(openCommit === c.hash ? null : c.hash)}>
          <code>{c.hash.slice(0, 8)}</code>
          {task && <span className="mr-task">{task}</span>}
          <span className="commit-subj">{c.subject}</span>
          <span className="spacer" />
          <span className="muted">{c.repo} · {c.author} · {day(c.date)}</span>
        </button>
        {openCommit === c.hash && c.files.length > 0 && <ul className="commit-files">{c.files.map((f) => <li key={f}><code>{f}</code></li>)}</ul>}
      </article>
    );
  };

  return (
    <div className="tool-panel dev">
      <div className="dev-bar">
        <Segmented size="small" value={group} onChange={setGroup} title={m.groupTip}
          options={[{ value: "services", label: m.group.services }, { value: "list", label: m.group.list }]} />
        {withTasks && <span className="muted">{m.withChildren(dev.children!.length)}</span>}
        {dev.at && <span className="muted" title={m.reloadTip}>{m.readAt(new Date(dev.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</span>}
        <span className="spacer" />
        <Button size="small" title={m.reloadTip} onClick={onReload}>↻ {m.reload}</Button>
      </div>
      <section>
        <h5>{m.mrs}<span className="tool-n">{mrs.mrs.length}</span></h5>
        {!mrs.configured && <p className="muted">{m.gitlabOff}</p>}
        {mrs.error != null && <div className="error">{m.gitlabFailed(errorText(mrs.error))}</div>}
        {mrs.configured && !mrs.error && mrs.mrs.length === 0 && <p className="muted">{m.noMrs}</p>}
        {layout(mrs.mrs, (r) => r.project, mrCard)}
      </section>

      <section>
        <h5>{m.commits}<span className="tool-n">{git.commits.length}</span></h5>
        {git.searched.length === 0 && <p className="muted">{mrs.mrs.length ? m.gitOffMrs : m.gitOff}</p>}
        {git.searched.length > 0 && git.commits.length === 0 && <p className="muted">{m.noCommits}</p>}
        {layout(git.commits, (c) => c.repo, commitCard)}
      </section>

      <details className="dev-where">
        <summary><h5>{m.where}</h5></summary>
        <ul>
          {git.searched.map((r) => (
            <li key={r.repoName}>
              <b>{r.repoName}</b>{" "}
              {r.error ? <span className="dev-err">{m.repoFailed(r.error)}</span> : <span className="muted">{git.docsEnabled ? m.refs(r.refs.join(", ")) : m.commitsOnly}</span>}
            </li>
          ))}
          {git.searched.length === 0 && <li className="muted">{m.gitOff}</li>}
          <li>
            <b>GitLab</b>{" "}
            <span className="muted">{!mrs.configured ? m.gitlabOff : mrs.error ? m.gitlabError : m.gitlabSearched(mrs.mrs.length, mrs.mrs.reduce((n, r) => n + r.files.length, 0))}</span>
          </li>
          <li>
            <b>{m.notes}</b>{" "}
            {git.docsEnabled ? (
              <span className="muted">
                {(() => { const n = notesOf(dev); return n.length ? m.notesFound(n.map((x) => `${x.path} (${x.where})`).join(", ")) : m.notesNone; })()}
                {" · "}{m.notesOn}
              </span>
            ) : (
              <span className="muted">{m.notesOff}{onSettings && <> <button className="board-more" onClick={onSettings}>{m.toSettings}</button></>}</span>
            )}
          </li>
        </ul>
      </details>
    </div>
  );
}
