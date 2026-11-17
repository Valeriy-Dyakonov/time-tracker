import { useState } from "react";
import { api } from "../../../api";
import { isoWeekday } from "../../../lib/dates";
import { dateShort, useT, weekdaysShort } from "../../../i18n";
import { Button, Field, InfoTip } from "../../ui";
import { SectionCard } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

const COUNTRIES = ["", "ru", "by", "kz", "ua", "uz", "us"] as const;

export function WorkSection({ f }: { f: SettingsForm }) {
  const { s, set } = f;
  const m = useT().settings.work;
  const [hol, setHol] = useState<string | null>(null);

  async function loadHolidays() {
    const y = new Date().getFullYear();
    setHol(m.loading);
    try {
      const h = await api.fetchHolidays(s.holidayCountry, `${y}-01-01`, `${y}-12-31`);
      const off = h.days.filter((d) => d.kind === "off" && isoWeekday(d.date) <= 5);
      const short = h.days.filter((d) => d.kind === "short");
      const list = (ds: { date: string }[]) => (ds.length ? ` (${ds.map((d) => dateShort(d.date)).join(", ")})` : "");
      setHol(m.holidays(h.source, y, off.length, list(off), short.length, list(short)));
    } catch (e) {
      setHol(m.loadFailed(String(e)));
    }
  }

  return (
    <SectionCard title={m.title}>
      <Field label={m.hours} hint={m.hoursHint}>
        <input type="number" min={1} max={24} step={0.25} value={s.hoursPerDay} onChange={(e) => set("hoursPerDay", Number(e.target.value) || 8)} />
      </Field>
      <Field label={m.calendar} hint={m.calendarHint}>
        <div className="row">
          <select value={s.holidayCountry} onChange={(e) => { set("holidayCountry", e.target.value); setHol(null); }}>
            {COUNTRIES.map((code) => <option key={code} value={code}>{m.countries[code || "none"]}</option>)}
          </select>
          <Button size="small" disabled={!s.holidayCountry} title={m.loadYearTitle} onClick={loadHolidays}>{m.loadYear}</Button>
        </div>
        {hol && <p className="hint">{hol}</p>}
      </Field>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={s.shortDays} onChange={(e) => set("shortDays", e.target.checked)} />
          {m.shortDays}
        </label>
        <InfoTip>{m.shortDaysTip}</InfoTip>
      </div>
      <Field label={m.workdays}>
        <div className="row wrap">
          {weekdaysShort().map((d, i) => (
            <label key={i} className="check">
              <input type="checkbox" checked={s.workdays.includes(i + 1)}
                onChange={(e) => set("workdays", e.target.checked ? [...s.workdays, i + 1].sort() : s.workdays.filter((x) => x !== i + 1))} />
              {d}
            </label>
          ))}
        </div>
      </Field>
      <label className="check">
        <input type="checkbox" checked={s.acceptInvalidCerts} onChange={(e) => set("acceptInvalidCerts", e.target.checked)} />
        {m.insecureTls}
      </label>
      <p className="hint">{m.insecureTlsHint}</p>
    </SectionCard>
  );
}
