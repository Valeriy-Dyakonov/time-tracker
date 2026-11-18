import type { ReactNode } from "react";
import { Badge, Button, Card, Field, InfoTip } from "@/shared/ui";
import type { Service, SettingsForm, TokenName } from "./useSettingsForm";
import { useT } from "@/i18n";

export function Status({ text }: { text?: string }) {
  if (!text) return null;
  const cls = text.startsWith("✓") ? "status ok" : text.startsWith("✗") ? "status err" : "status";
  return <span className={cls}>{text}</span>;
}

export function TokenField({ f, name, label, hint, noun }: { f: SettingsForm; name: TokenName; label: string; hint?: string; noun?: string }) {
  const t = useT();
  const m = t.settings.token;
  const what = noun ?? m.noun;
  const saved = f.stored[name];
  return (
    <Field label={label} hint={saved ? m.savedHint(what) : hint ?? m.defaultHint}>
      <div className="row">
        <input type="password" autoComplete="off" value={f.tok[name]} placeholder={saved ? "••••••••••" : m.placeholder(what)}
          onChange={(e) => f.setTok({ ...f.tok, [name]: e.target.value })} />
        {saved && <Button variant="ghost" size="small" title={m.removeTitle} onClick={() => f.removeToken(name)}>{t.common.remove}</Button>}
      </div>
    </Field>
  );
}

export function TestButton({ f, svc }: { f: SettingsForm; svc: Service }) {
  const m = useT().settings.test;
  return (
    <div className="row">
      <Button size="small" title={m.title} onClick={() => f.test(svc)}>{m.button}</Button>
      <Status text={f.msg[svc]} />
    </div>
  );
}

export function SectionCard({ title, badge, tip, children }: { title: string; badge?: "req" | "opt" | "rec"; tip?: ReactNode; children: ReactNode }) {
  const c = useT().common;
  const label = badge === "req" ? c.required : badge === "rec" ? c.recommended : badge === "opt" ? c.optional : "";
  return (
    <Card>
      <h3>{title}{tip && <InfoTip>{tip}</InfoTip>} {badge && <Badge tone={badge === "req" ? "req" : "opt"}>{label}</Badge>}</h3>
      {children}
    </Card>
  );
}

export const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
