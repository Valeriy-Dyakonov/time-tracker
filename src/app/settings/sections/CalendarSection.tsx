import { useT } from "@/i18n";
import { Field, Help } from "@/shared/ui";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function CalendarSection({ f }: { f: SettingsForm }) {
  const t = useT();
  const m = t.settings.calendar;
  return (
    <SectionCard title={m.title} badge="opt">
      <Field label={m.url} hint={m.urlHint}>
        <input value={f.s.exchangeUrl} placeholder="https://mail.company.ru" onChange={(e) => f.set("exchangeUrl", e.target.value)} />
      </Field>
      <Field label={m.user} hint={m.userHint}>
        <input value={f.s.exchangeUser} placeholder="COMPANY\\ivan" onChange={(e) => f.set("exchangeUser", e.target.value)} />
      </Field>
      <TokenField f={f} name="exchange_password" label={m.password} hint={t.settings.token.defaultHint} noun={m.password} />
      <label className="check">
        <input type="checkbox" checked={f.s.calendarOnlyCalls} onChange={(e) => f.set("calendarOnlyCalls", e.target.checked)} />
        {m.onlyCalls}
      </label>
      <Help title={m.helpTitle} steps={m.helpSteps} note={m.helpNote} />
      <TestButton f={f} svc="calendar" />
    </SectionCard>
  );
}
