import type { ReactNode } from "react";
import { Field } from "../ui";
import type { Service, SettingsForm, TokenName } from "./useSettingsForm";

export function Status({ text }: { text?: string }) {
  if (!text) return null;
  const cls = text.startsWith("✓") ? "status ok" : text.startsWith("✗") ? "status err" : "status";
  return <span className={cls}>{text}</span>;
}

export function TokenField({ f, name, label, hint, noun = "Токен" }: { f: SettingsForm; name: TokenName; label: string; hint?: string; noun?: string }) {
  const saved = f.stored[name];
  return (
    <Field label={label} hint={saved ? `✓ ${noun} сохранён в Windows Credential Manager. Чтобы заменить — введите новый.` : hint ?? "Хранится в системном хранилище паролей, не в файле настроек."}>
      <div className="row">
        <input type="password" autoComplete="off" value={f.tok[name]} placeholder={saved ? "••••••••••" : `Вставьте ${noun.toLowerCase()}`}
          onChange={(e) => f.setTok({ ...f.tok, [name]: e.target.value })} />
        {saved && <button className="btn small ghost" title="Удалить из системного хранилища" onClick={() => f.removeToken(name)}>Удалить</button>}
      </div>
    </Field>
  );
}

export function TestButton({ f, svc }: { f: SettingsForm; svc: Service }) {
  return (
    <div className="row">
      <button className="btn small" title="Сохранить настройки и сделать пробный запрос к сервису" onClick={() => f.test(svc)}>Проверить подключение</button>
      <Status text={f.msg[svc]} />
    </div>
  );
}

export function SectionCard({ title, badge, children }: { title: string; badge?: "req" | "opt" | "rec"; children: ReactNode }) {
  const label = badge === "req" ? "обязательно" : badge === "rec" ? "рекомендуется" : badge === "opt" ? "необязательно" : "";
  return (
    <section className="card">
      <h3>{title} {badge && <span className={`badge ${badge === "req" ? "req" : "opt"}`}>{label}</span>}</h3>
      {children}
    </section>
  );
}

export const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
