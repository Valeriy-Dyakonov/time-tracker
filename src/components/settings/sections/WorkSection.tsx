import { useState } from "react";
import { api } from "../../../api";
import { isoWeekday, WEEKDAYS_SHORT } from "../../../lib/dates";
import { Button, Field, InfoTip } from "../../ui";
import { SectionCard } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

const COUNTRIES: [string, string][] = [
  ["", "Не учитывать (только дни недели)"],
  ["ru", "Россия"], ["by", "Беларусь"], ["kz", "Казахстан"], ["ua", "Украина"], ["uz", "Узбекистан"], ["us", "США"],
];

const ddmm = (date: string) => `${date.slice(8)}.${date.slice(5, 7)}`;

export function WorkSection({ f }: { f: SettingsForm }) {
  const { s, set } = f;
  const [hol, setHol] = useState<string | null>(null);

  async function loadHolidays() {
    const y = new Date().getFullYear();
    setHol("Загружаю…");
    try {
      const h = await api.fetchHolidays(s.holidayCountry, `${y}-01-01`, `${y}-12-31`);
      const off = h.days.filter((d) => d.kind === "off" && isoWeekday(d.date) <= 5);
      const short = h.days.filter((d) => d.kind === "short");
      const list = (ds: { date: string }[]) => (ds.length ? ` (${ds.map((d) => ddmm(d.date)).join(", ")})` : "");
      setHol(`Источник: ${h.source}. ${y}: праздничных будней ${off.length}${list(off)}; сокращённых дней ${short.length}${list(short)}.`);
    } catch (e) {
      setHol(`Не удалось загрузить: ${e}`);
    }
  }

  return (
    <SectionCard title="Рабочее время">
      <Field label="Часов в день по умолчанию" hint="Именно столько будет списано в каждый рабочий день.">
        <input type="number" min={1} max={24} step={0.25} value={s.hoursPerDay} onChange={(e) => set("hoursPerDay", Number(e.target.value) || 8)} />
      </Field>
      <Field label="Производственный календарь" hint="Праздники и перенесённые выходные не заполняются, перенесённые рабочие субботы — заполняются. Данные берутся с публичного сервиса isdayoff.ru (отправляются только даты и код страны); если сервис недоступен, используются встроенные данные (РФ и США на 2026–2027).">
        <div className="row">
          <select value={s.holidayCountry} onChange={(e) => { set("holidayCountry", e.target.value); setHol(null); }}>
            {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <Button size="small" disabled={!s.holidayCountry} title="Показать праздники и сокращённые дни текущего года — чтобы проверить, что календарь подхватился" onClick={loadHolidays}>Загрузить за год</Button>
        </div>
        {hol && <p className="hint">{hol}</p>}
      </Field>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={s.shortDays} onChange={(e) => set("shortDays", e.target.checked)} />
          Предпраздничные дни короче на 1 час
        </label>
        <InfoTip>По ТК РФ рабочий день перед праздником сокращается на час. Если включено, норма такого дня будет на час меньше.</InfoTip>
      </div>
      <Field label="Рабочие дни">
        <div className="row wrap">
          {WEEKDAYS_SHORT.map((d, i) => (
            <label key={d} className="check">
              <input type="checkbox" checked={s.workdays.includes(i + 1)}
                onChange={(e) => set("workdays", e.target.checked ? [...s.workdays, i + 1].sort() : s.workdays.filter((x) => x !== i + 1))} />
              {d}
            </label>
          ))}
        </div>
      </Field>
      <label className="check">
        <input type="checkbox" checked={s.acceptInvalidCerts} onChange={(e) => set("acceptInvalidCerts", e.target.checked)} />
        Не проверять TLS-сертификаты
      </label>
      <p className="hint">Включайте, только если при проверке подключения видите ошибку сертификата (у корпоративных сервисов часто самоподписанный).</p>
    </SectionCard>
  );
}
