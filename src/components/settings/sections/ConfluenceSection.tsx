import { Field, Help } from "../../ui";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function ConfluenceSection({ f }: { f: SettingsForm }) {
  return (
    <SectionCard title="Confluence" badge="opt">
      <Field label="Адрес Confluence" hint="Страницы и комментарии, которые вы создали или правили, попадут в контекст анализа."
        tip="Помогает учесть дни, ушедшие на документацию и аналитику. Страницы, привязанные к задачам, также дают ИИ контекст о сути задачи.">
        <input value={f.s.confluenceUrl} placeholder="https://confluence.company.ru" onChange={(e) => f.set("confluenceUrl", e.target.value)} />
      </Field>
      <TokenField f={f} name="confluence_pat" label="Personal Access Token" />
      <Help
        title="Где взять токен Confluence"
        steps={[
          "Откройте Confluence в браузере и войдите.",
          "Нажмите на свой аватар в правом верхнем углу → «Настройки» (Settings).",
          "В меню слева выберите «Personal Access Tokens».",
          "Нажмите «Create token», задайте имя и срок действия, затем скопируйте токен и вставьте сюда.",
        ]}
        note="Нужен Confluence Server/Data Center версии 7.9 или новее. Если пункта нет — попросите администратора включить токены доступа."
      />
      <TestButton f={f} svc="confluence" />
    </SectionCard>
  );
}
