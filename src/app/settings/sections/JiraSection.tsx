import { useState } from "react";
import { useT } from "@/i18n";
import { Field, Help, Segmented } from "@/shared/ui";
import { asProfile, PROFILES } from "@/products/dashboard/lib/stages";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

const parseKeys = (text: string) => [...new Set(text.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))];

export function JiraSection({ f }: { f: SettingsForm }) {
  const [ctxText, setCtxText] = useState(f.s.contextProjects.join(", "));
  const all = useT();
  const m = all.settings.jira;
  return (
    <SectionCard title="Jira" badge="req">
      <Field label={m.url} hint={m.urlHint}>
        <input value={f.s.jiraUrl} placeholder="https://jira.company.ru" onChange={(e) => f.set("jiraUrl", e.target.value)} />
      </Field>
      <TokenField f={f} name="jira_pat" label="Personal Access Token" />
      <Field label={m.context} hint={m.contextHint}>
        <input value={ctxText} placeholder="ABC, XYZ" onChange={(e) => { setCtxText(e.target.value); f.set("contextProjects", parseKeys(e.target.value)); }} />
      </Field>
      <Field label={m.profile} hint={m.profileHint} tip={all.dashboard.profileTip}>
        <Segmented size="small" value={asProfile(f.s.dashboardProfile)} onChange={(p) => f.set("dashboardProfile", p)}
          options={PROFILES.map((p) => ({ value: p, label: all.dashboard.profiles[p] }))} />
      </Field>
      <Help title={m.helpTitle} steps={m.helpSteps} note={m.helpNote} />
      <TestButton f={f} svc="jira" />
    </SectionCard>
  );
}
