import { useT } from "../../../i18n";
import { Field, Help } from "../../ui";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function LlmSection({ f }: { f: SettingsForm }) {
  const m = useT().settings.llm;
  return (
    <SectionCard title={m.title} badge="rec">
      <Field label="Base URL" hint={m.baseUrlHint} tip={m.baseUrlTip}>
        <input value={f.s.llmBaseUrl} placeholder="https://ai.company.ru/v1" onChange={(e) => f.set("llmBaseUrl", e.target.value)} />
      </Field>
      <Field label={m.model} hint={m.modelHint}>
        <input value={f.s.llmModel} onChange={(e) => f.set("llmModel", e.target.value)} />
      </Field>
      <TokenField f={f} name="llm_key" label="API key" hint={m.keyHint} />
      <Help title={m.helpTitle} steps={m.helpSteps} note={m.helpNote} />
      <TestButton f={f} svc="llm" />
    </SectionCard>
  );
}
