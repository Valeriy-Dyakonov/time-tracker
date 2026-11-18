import { useState } from "react";
import { useT } from "@/i18n";
import { api, errorText } from "@/shared/api";
import type { TaskDev } from "./useTaskDev";

const day = (iso: string) => iso.slice(0, 10);

/**
 * What is known about the task's development: merge requests in GitLab, commits in the local repositories,
 * and where exactly the app looked, so "nothing found" can be told from "not looked".
 */
export function DevPanel({ dev, onSettings }: { dev: TaskDev; onSettings?: () => void }) {
  const m = useT().dashboard.dev;
  const { git, mrs } = dev;
  const [openMr, setOpenMr] = useState<string | null>(null);
  const [openCommit, setOpenCommit] = useState<string | null>(null);

  return (
    <div className="tool-panel dev">
      <section>
        <h5>{m.mrs}<span className="tool-n">{mrs.mrs.length}</span></h5>
        {!mrs.configured && <p className="muted">{m.gitlabOff}</p>}
        {mrs.error != null && <div className="error">{m.gitlabFailed(errorText(mrs.error))}</div>}
        {mrs.configured && !mrs.error && mrs.mrs.length === 0 && <p className="muted">{m.noMrs}</p>}
        {mrs.mrs.map((r) => {
          const id = `${r.projectId}!${r.iid}`;
          return (
            <article key={id} className={`mr st-${r.state}`}>
              <button className="mr-h" onClick={() => setOpenMr(openMr === id ? null : id)}>
                <span className="mr-state">{m.states[r.state as keyof typeof m.states] ?? r.state}</span>
                <span className="mr-title">{r.title}</span>
                <span className="spacer" />
                <span className="muted">{r.commits.length > 0 && m.commitsN(r.commits.length)}</span>
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
            </article>
          );
        })}
      </section>

      <section>
        <h5>{m.commits}<span className="tool-n">{git.commits.length}</span></h5>
        {git.searched.length === 0 && <p className="muted">{m.gitOff}</p>}
        {git.searched.length > 0 && git.commits.length === 0 && <p className="muted">{m.noCommits}</p>}
        {git.commits.map((c) => (
          <article key={c.hash} className="commit">
            <button className="commit-h" onClick={() => setOpenCommit(openCommit === c.hash ? null : c.hash)}>
              <code>{c.hash.slice(0, 8)}</code>
              <span className="commit-subj">{c.subject}</span>
              <span className="spacer" />
              <span className="muted">{c.repo} · {c.author} · {day(c.date)}</span>
            </button>
            {openCommit === c.hash && c.files.length > 0 && <ul className="commit-files">{c.files.map((f) => <li key={f}><code>{f}</code></li>)}</ul>}
          </article>
        ))}
      </section>

      <section className="dev-where">
        <h5>{m.where}</h5>
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
            <span className="muted">{!mrs.configured ? m.gitlabOff : mrs.error ? m.gitlabError : m.gitlabSearched(mrs.mrs.length)}</span>
          </li>
          <li>
            <b>{m.notes}</b>{" "}
            {git.docsEnabled ? <span className="muted">{m.notesOn}</span> : (
              <span className="muted">{m.notesOff}{onSettings && <> <button className="board-more" onClick={onSettings}>{m.toSettings}</button></>}</span>
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}
