import { useT } from "../../../i18n";
import { Field, Help } from "../../ui";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function ConfluenceSection({ f }: { f: SettingsForm }) {
  const m = useT().settings.confluence;
  return (
    <SectionCard title="Confluence" badge="opt">
      <Field label={m.url} hint={m.urlHint} tip={m.urlTip}>
        <input value={f.s.confluenceUrl} placeholder="https://confluence.company.ru" onChange={(e) => f.set("confluenceUrl", e.target.value)} />
      </Field>
      <TokenField f={f} name="confluence_pat" label="Personal Access Token" />
      <Help title={m.helpTitle} steps={m.helpSteps} note={m.helpNote} />
      <TestButton f={f} svc="confluence" />
    </SectionCard>
  );
}
