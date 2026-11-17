import { useState } from "react";
import { Field, Help } from "../../ui";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

const parseKeys = (text: string) => [...new Set(text.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))];

export function JiraSection({ f }: { f: SettingsForm }) {
  const [ctxText, setCtxText] = useState(f.s.contextProjects.join(", "));
  return (
    <SectionCard title="Jira" badge="req">
      <Field label="Адрес Jira" hint="Адрес, по которому вы заходите в Jira в браузере.">
        <input value={f.s.jiraUrl} placeholder="https://jira.company.ru" onChange={(e) => f.set("jiraUrl", e.target.value)} />
      </Field>
      <TokenField f={f} name="jira_pat" label="Personal Access Token" />
      <Field label="Проекты только для контекста" hint="Ключи проектов через запятую, например RFS, BFR. События по ним (коммиты, чат, звонки) останутся подсказкой для ИИ, но часы на такие задачи не начисляются. Подходит для чужих проектов и задач без права списывать время.">
        <input value={ctxText} placeholder="RFS, BFR" onChange={(e) => { setCtxText(e.target.value); f.set("contextProjects", parseKeys(e.target.value)); }} />
      </Field>
      <Help
        title="Где взять токен Jira"
        steps={[
          "Откройте Jira в браузере и войдите под своей учётной записью.",
          "Нажмите на свой аватар в правом верхнем углу → «Профиль» (Profile).",
          "В меню слева выберите «Personal Access Tokens» («Персональные токены доступа»).",
          "Нажмите «Create token», задайте имя (например, Worklog Tracker) и срок действия.",
          "Скопируйте показанный токен и вставьте сюда. Jira показывает его только один раз.",
        ]}
        note="Токен даёт те же права, что и ваша учётка; приложение использует его только для чтения. Если пункта «Personal Access Tokens» нет — функция выключена администратором или Jira старше версии 8.14: попросите администратора включить её или выдать токен."
      />
      <TestButton f={f} svc="jira" />
    </SectionCard>
  );
}
