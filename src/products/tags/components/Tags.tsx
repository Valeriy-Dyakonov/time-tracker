import { useRef, useState, type FormEvent } from "react";
import { useT } from "@/i18n";
import { dateFull } from "@/i18n/format";
import { api, errorText } from "@/shared/api";
import { useStored } from "@/shared/hooks/useStored";
import { localDate } from "@/shared/lib/dates";
import type { SetupState } from "@/shared/lib/setup";
import type { ServiceTags, TagHit } from "@/shared/types";
import { Button, CopyButton, CopyIcon, InfoTip } from "@/shared/ui";
import { tagsText } from "../lib/list";

function open(e: React.MouseEvent, url: string) {
  e.preventDefault();
  void api.openLink(url);
}

function TagRow({ tag, latest }: { tag: TagHit; latest: boolean }) {
  const m = useT().tags;
  return (
    <li className={`tag ${latest ? "latest" : ""}`}>
      <a className="tag-name" href={tag.url} title={m.openTag} onClick={(e) => open(e, tag.url)}>{tag.name}</a>
      <CopyIcon text={tag.name} title={m.copyTag} />
      {latest && <span className="tag-latest">{m.latest}</span>}
      <span className="tag-date muted">{tag.created > 0 ? dateFull(localDate(new Date(tag.created))) : m.unknownDate}</span>
      <span className="tag-branches" title={m.branchesTip}>
        {tag.branches.length === 0 ? <span className="muted">{m.noBranches}</span> : tag.branches.map((b) => <code key={b}>{b}</code>)}
      </span>
      {tag.message && <span className="tag-msg muted" title={tag.message}>{tag.message}</span>}
    </li>
  );
}

function Service({ s }: { s: ServiceTags }) {
  const m = useT().tags;
  return (
    <article className="tags-service">
      <h3>
        {s.url ? <a href={s.url} title={m.openProject} onClick={(e) => open(e, s.url)}>{s.project}</a> : s.project}
        <span className="tags-count">{s.tags.length}</span>
      </h3>
      <ul>{s.tags.map((t, i) => <TagRow key={t.name} tag={t} latest={i === 0} />)}</ul>
    </article>
  );
}

/** Tag search: the latest tags whose name contains a text, per service (GitLab project of a selected local repository). Read-only. */
export default function Tags({ setup, onOpenSettings }: { setup: SetupState; onOpenSettings: () => void }) {
  const m = useT().tags;
  const [query, setQuery] = useStored("worklog.tags.query", "");
  const [services, setServices] = useState<ServiceTags[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const loading = total !== null && done < total;

  if (!setup.gitlab) {
    return (
      <div className="mrs-setup">
        <p className="muted">{m.needGitlab}</p>
        <Button variant="primary" onClick={onOpenSettings}>{m.openSettings}</Button>
      </div>
    );
  }

  const run = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const mark = ++seq.current;
    setServices([]);
    setDone(0);
    setTotal(null);
    setError("");
    let projects: string[];
    try {
      projects = await api.gitlabTagProjects();
    } catch (err) {
      if (mark === seq.current) setError(m.failed(errorText(err)));
      return;
    }
    if (mark !== seq.current) return;
    setTotal(projects.length);
    // A few projects at a time; each result is shown as soon as it arrives.
    const queue = [...projects];
    const worker = async () => {
      for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
        const r = await api.gitlabTagService(p, q).catch((err): ServiceTags => ({ project: p, url: "", tags: [], error: err }));
        if (mark !== seq.current) return;
        setDone((n) => n + 1);
        if (r.tags.length > 0 || r.error != null) setServices((l) => [...l, r].sort((a, b) => (b.tags[0]?.created ?? 0) - (a.tags[0]?.created ?? 0) || a.project.localeCompare(b.project)));
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, projects.length) }, worker));
  };

  const found = services.filter((s) => s.tags.length > 0);
  const failed = services.filter((s) => s.error != null);

  return (
    <section className="tags">
      <form className="tags-search" onSubmit={run}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={m.placeholder} autoFocus spellCheck={false} />
        <InfoTip>{m.searchTip}</InfoTip>
        <Button variant="primary" type="submit" disabled={loading || !query.trim()}>{loading ? m.searching : m.search}</Button>
      </form>

      {error && <div className="error">{error}</div>}
      {total === 0 && <p className="muted">{m.noRepos}</p>}
      {total !== null && total > 0 && (
        <p className="muted tags-summary">
          {loading && <i className="spin" />}
          {loading ? m.progress(done, total) : found.length > 0 ? m.summary(found.length, total) : m.nothing}
          {found.length > 0 && <CopyButton text={() => tagsText(found)} label={m.copyAll} title={m.copyAllTip} />}
        </p>
      )}
      {found.map((s) => <Service key={s.project} s={s} />)}
      {failed.map((s) => <div key={s.project} className="error">{s.project}: {m.readFailed(errorText(s.error))}</div>)}
    </section>
  );
}
