import { Field, Help } from "../../ui";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function GitlabSection({ f }: { f: SettingsForm }) {
  return (
    <SectionCard title="GitLab" badge="opt">
      <Field label="Адрес GitLab" hint="MR, которые вы создали, одобрили или комментировали при ревью. В названии или ветке MR обычно есть ключ задачи, так ревью попадает в нужный день и на нужную задачу.">
        <input value={f.s.gitlabUrl} placeholder="https://gitlab.company.ru" onChange={(e) => f.set("gitlabUrl", e.target.value)} />
      </Field>
      <TokenField f={f} name="gitlab_pat" label="Personal Access Token" />
      <label className="check" style={{ margin: "4px 0 12px" }}>
        <input type="checkbox" checked={f.s.gitlabLocalOnly} onChange={(e) => f.set("gitlabLocalOnly", e.target.checked)} />
        Читать только проекты выбранных локальных репозиториев (по адресу origin)
      </label>
      <Help
        title="Где взять токен GitLab"
        steps={[
          "Откройте GitLab в браузере и войдите.",
          "Нажмите на аватар → «Edit profile» (Preferences) → слева «Access Tokens».",
          "Нажмите «Add new token», задайте имя и срок действия.",
          "Отметьте только право read_api (чтение) и создайте токен.",
          "Скопируйте токен сразу (потом его не показать) и вставьте сюда.",
        ]}
        note="Токен нужен только для чтения. Если у вас в GitLab нельзя создавать личные токены, попросите администратора."
      />
      <TestButton f={f} svc="gitlab" />
    </SectionCard>
  );
}
