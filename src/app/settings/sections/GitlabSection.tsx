import { useT } from "@/i18n";
import { Field, Help } from "@/shared/ui";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function GitlabSection({ f }: { f: SettingsForm }) {
  const m = useT().settings.gitlab;
  return (
    <SectionCard title="GitLab" badge="opt">
      <Field label={m.url} hint={m.urlHint}>
        <input value={f.s.gitlabUrl} placeholder="https://gitlab.company.ru" onChange={(e) => f.set("gitlabUrl", e.target.value)} />
      </Field>
      <TokenField f={f} name="gitlab_pat" label="Personal Access Token" />
      <label className="check" style={{ margin: "4px 0 12px" }}>
        <input type="checkbox" checked={f.s.gitlabLocalOnly} onChange={(e) => f.set("gitlabLocalOnly", e.target.checked)} />
        {m.localOnly}
      </label>
      <Help title={m.helpTitle} steps={m.helpSteps} note={m.helpNote} />
      <TestButton f={f} svc="gitlab" />
    </SectionCard>
  );
}
