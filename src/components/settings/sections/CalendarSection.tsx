import { Field, Help } from "../../ui";
import { SectionCard, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function CalendarSection({ f }: { f: SettingsForm }) {
  return (
    <SectionCard title="Почта и календарь (Exchange)" badge="opt">
      <Field label="Адрес почты" hint="Адрес, по которому вы открываете Outlook в браузере, например https://mail.company.ru. Путь /EWS/Exchange.asmx допишется сам.">
        <input value={f.s.exchangeUrl} placeholder="https://mail.company.ru" onChange={(e) => f.set("exchangeUrl", e.target.value)} />
      </Field>
      <Field label="Логин" hint="Тот же, что при входе в Outlook: ДОМЕН\логин или логин@company.ru.">
        <input value={f.s.exchangeUser} placeholder="COMPANY\\ivan" onChange={(e) => f.set("exchangeUser", e.target.value)} />
      </Field>
      <TokenField f={f} name="exchange_password" label="Пароль" hint="Хранится в системном хранилище паролей, не в файле настроек." noun="Пароль" />
      <label className="check">
        <input type="checkbox" checked={f.s.calendarOnlyCalls} onChange={(e) => f.set("calendarOnlyCalls", e.target.checked)} />
        Учитывать только звонки (Teams, Zoom, Телемост, «созвон» в теме или месте)
      </label>
      <Help
        title="Что приложение берёт из календаря и как использует"
        steps={[
          "Читаются только время, тема, организатор и место встреч за период. Текст приглашений и список участников не запрашиваются.",
          "Пропускаются отменённые и отклонённые встречи, события со статусом «Свободен» и «Нет на месте», события на весь день и блоки длиннее 10 часов.",
          "Время звонков остаётся внутри рабочего дня и не вычитается. Тема встречи уходит ИИ как контекст (по ней он может понять, к какой задаче относится день). Если в теме есть ключ вроде PAY-123, встреча слегка добавит вес этой задаче.",
          "В отчёте звонки и встречи отмечены отдельной строкой под каждым днём; их же можно выгрузить в CSV и Markdown.",
        ]}
        note="Если «Проверить подключение» отвечает 401, хотя пароль верный: либо нужен другой формат логина, либо на сервере включена двухфакторная защита или только NTLM/Kerberos. Тогда напишите мне текст ошибки — подберём вариант."
      />
      <TestButton f={f} svc="calendar" />
    </SectionCard>
  );
}
