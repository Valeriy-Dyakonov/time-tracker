import { useState } from "react";
import { api, type RepoInfo } from "../../../api";
import { Field, Help } from "../../ui";
import { lines, SectionCard, Status } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function GitSection({ f }: { f: SettingsForm }) {
  const { s, set } = f;
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");

  async function scan() {
    setStatus("Ищу репозитории…");
    try {
      const found = await api.scanGitRepos(s.gitRoot);
      setRepos(found);
      setStatus(`✓ Найдено: ${found.length}`);
    } catch (e) {
      setStatus("✗ " + e);
    }
  }

  const shown = (repos ?? []).filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (path: string, on: boolean) => set("gitRepos", on ? [...new Set([...s.gitRepos, path])] : s.gitRepos.filter((x) => x !== path));

  return (
    <SectionCard title="Git" badge="opt">
      <Field label="Папка с репозиториями" hint="Приложение найдёт все git-репозитории внутри (до 3 уровней вглубь)."
        tip="Ваши коммиты показывают, над чем и когда вы работали: ключ задачи обычно есть в ветке или сообщении коммита. Читается только локальная история, ничего не отправляется.">
        <div className="row">
          <input value={s.gitRoot} placeholder="C:\Work" onChange={(e) => set("gitRoot", e.target.value)} />
          <button className="btn small" onClick={scan}>Найти</button>
        </div>
        <Status text={status} />
      </Field>
      {repos && (
        <div className="rooms">
          <div className="row">
            <input placeholder="Фильтр по имени" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="btn small ghost" onClick={() => set("gitRepos", [...new Set([...s.gitRepos, ...shown.map((r) => r.path)])])}>Выбрать все</button>
            <button className="btn small ghost" onClick={() => set("gitRepos", s.gitRepos.filter((p) => !shown.some((r) => r.path === p)))}>Снять</button>
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
      <Field label="Выбранные репозитории" hint={`Выбрано: ${s.gitRepos.length}. Можно дописать путь вручную, по одному на строку.`}>
        <textarea rows={3} value={s.gitRepos.join("\n")} onChange={(e) => set("gitRepos", lines(e.target.value))} />
      </Field>
      <Field label="Автор коммитов" hint="Чтобы не искать вручную — оставьте пустым: возьмётся email из git config каждого репозитория."
        tip="По этим адресам приложение отличает ваши коммиты от чужих.">
        <textarea rows={2} value={s.gitAuthors.join("\n")} placeholder="ivan@company.ru" onChange={(e) => set("gitAuthors", lines(e.target.value))} />
      </Field>
      <Help
        title="Как узнать свой email в git"
        steps={["Откройте терминал в любом из репозиториев и выполните: git config user.email", "Если коммитите с разных адресов — впишите каждый с новой строки."]}
      />
    </SectionCard>
  );
}
