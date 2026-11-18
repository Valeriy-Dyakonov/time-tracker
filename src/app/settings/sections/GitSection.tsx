import { useState } from "react";
import { api, type RepoInfo } from "@/shared/api";
import { useT } from "@/i18n";
import { Button, Field, Help } from "@/shared/ui";
import { LinesInput, SectionCard, Status } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function GitSection({ f }: { f: SettingsForm }) {
  const { s, set } = f;
  const m = useT().settings.git;
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");

  async function scan() {
    setStatus(m.scanning);
    try {
      const found = await api.scanGitRepos(s.gitRoot);
      setRepos(found);
      setStatus(m.found(found.length));
    } catch (e) {
      setStatus("✗ " + e);
    }
  }

  const shown = (repos ?? []).filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (path: string, on: boolean) => set("gitRepos", on ? [...new Set([...s.gitRepos, path])] : s.gitRepos.filter((x) => x !== path));

  return (
    <SectionCard title="Git" badge="opt">
      <Field label={m.root} hint={m.rootHint} tip={m.rootTip}>
        <div className="row">
          <input value={s.gitRoot} placeholder="C:\Work" onChange={(e) => set("gitRoot", e.target.value)} />
          <Button size="small" onClick={scan}>{m.find}</Button>
        </div>
        <Status text={status} />
      </Field>
      {repos && (
        <div className="rooms">
          <div className="row">
            <input placeholder={m.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Button variant="ghost" size="small" onClick={() => set("gitRepos", [...new Set([...s.gitRepos, ...shown.map((r) => r.path)])])}>{m.selectAll}</Button>
            <Button variant="ghost" size="small" onClick={() => set("gitRepos", s.gitRepos.filter((p) => !shown.some((r) => r.path === p)))}>{m.clear}</Button>
          </div>
          <div className="room-list">
            {shown.map((r) => (
              <label key={r.path} className="check" title={r.path}>
                <input type="checkbox" checked={s.gitRepos.includes(r.path)} onChange={(e) => toggle(r.path, e.target.checked)} />
                {r.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <Field label={m.selected} hint={m.selectedHint(s.gitRepos.length)}>
        <LinesInput rows={3} value={s.gitRepos} onChange={(v) => set("gitRepos", v)} />
      </Field>
      <Field label={m.authors} hint={m.authorsHint} tip={m.authorsTip}>
        <LinesInput value={s.gitAuthors} placeholder="ivan@company.ru" onChange={(v) => set("gitAuthors", v)} />
      </Field>
      <div className="sub-option">
        <label className="check" title={m.aiDocsTip}>
          <input type="checkbox" checked={s.aiDocsEnabled} onChange={(e) => set("aiDocsEnabled", e.target.checked)} />
          {m.aiDocs}
        </label>
        {s.aiDocsEnabled && (
          <div className="sub-option-body">
            <Field label={m.aiDocsPaths} hint={m.aiDocsPathsHint}>
              <LinesInput value={s.aiDocsPaths} placeholder={"docs/ai/{key}\nai/{key}"} onChange={(v) => set("aiDocsPaths", v)} />
            </Field>
          </div>
        )}
      </div>
      <Help title={m.helpTitle} steps={m.helpSteps} />
    </SectionCard>
  );
}
