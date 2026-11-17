import { useState } from "react";
import { api, type Room } from "../../../api";
import { Button, Field, Help } from "../../ui";
import { SectionCard, Status, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function MatrixSection({ f }: { f: SettingsForm }) {
  const { s, set } = f;
  return (
    <SectionCard title="Matrix" badge="opt">
      <Field label="Homeserver" hint="Адрес вашего Matrix-сервера."
        tip="Ваши сообщения в рабочих чатах помогают понять, чем вы занимались в день без коммитов: обсуждения, ревью, помощь коллегам. Читаются только ваши сообщения.">
        <input value={s.matrixHomeserver} placeholder="https://matrix.company.ru" onChange={(e) => set("matrixHomeserver", e.target.value)} />
      </Field>
      <Field label="Ваш Matrix ID" hint="Выглядит как @логин:домен.">
        <input value={s.matrixUserId} placeholder="@ivan:company.ru" onChange={(e) => set("matrixUserId", e.target.value)} />
      </Field>
      <TokenField f={f} name="matrix_token" label="Access token" />
      <Help
        title="Где взять данные Matrix (в Element)"
        steps={[
          "Откройте Element → нажмите на свой аватар слева вверху → «Все настройки» (All settings).",
          "Ваш Matrix ID виден на вкладке «Общие» под именем профиля.",
          "Перейдите во «Помощь и о программе» (Help & About) и прокрутите вниз до раздела «Дополнительно» (Advanced).",
          "Там указан Homeserver (адрес сервера) и «Токен доступа» (Access Token) — нажмите, чтобы показать, и скопируйте.",
        ]}
        note="Внимание: токен даёт полный доступ к вашему аккаунту — никому не передавайте. Если вы выйдете из этой сессии Element (Sign out), токен перестанет работать, и его придётся взять заново."
      />
      <TestButton f={f} svc="matrix" />
      <MatrixLogin f={f} />
      <RoomExclusions f={f} />
    </SectionCard>
  );
}

function MatrixLogin({ f }: { f: SettingsForm }) {
  const { s } = f;
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState("");

  async function login(kind: "sso" | "pw") {
    setStatus(kind === "sso" ? "Открыл браузер — войдите там, у вас 4 минуты…" : "Вхожу…");
    try {
      await api.saveSettings(s); // the backend reads the homeserver address from saved settings
      const id = kind === "sso" ? await api.matrixLoginSso() : await api.matrixLoginPassword(user, pw);
      setPw("");
      await f.refresh();
      f.adopt(id ? { ...s, matrixUserId: id } : s);
      setStatus(`✓ Токен получен и сохранён${id ? " для " + id : ""}. Нажмите «Проверить подключение».`);
    } catch (e) {
      setStatus("✗ " + e);
    }
  }

  const noServer = !s.matrixHomeserver.trim();
  return (
    <details className="help" open={!!f.msg.matrix?.startsWith("✗") || !!status}>
      <summary>Токен не подходит или истёк? Получить новый здесь</summary>
      <p className="note">Приложение войдёт так же, как это делает Element, и само сохранит токен. Это отдельная сессия «Worklog Tracker»: она не зависит от вашего Element, и выход из него её не сломает. Сначала заполните Homeserver выше.</p>
      <div className="row"><Button size="small" disabled={noServer} onClick={() => login("sso")}>Войти через SSO (откроется браузер)</Button></div>
      <div className="row wrap">
        <input style={{ width: 150 }} placeholder="логин" value={user} onChange={(e) => setUser(e.target.value)} />
        <input style={{ width: 150 }} type="password" placeholder="пароль" value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button size="small" disabled={noServer || !user || !pw} onClick={() => login("pw")}>Войти по паролю</Button>
      </div>
      <p className="note">Пароль используется один раз и нигде не сохраняется. Если у вас вход только через корпоративный SSO — выбирайте первый вариант.</p>
      <Status text={status} />
    </details>
  );
}

function RoomExclusions({ f }: { f: SettingsForm }) {
  const { s, set } = f;
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    setStatus("Загружаю комнаты…");
    try {
      await f.persist();
      setRooms(await api.listMatrixRooms());
      setStatus("");
    } catch (e) {
      setStatus("✗ " + e);
    }
  }

  const excluded = s.matrixExcludeRooms;
  const shown = (rooms ?? []).filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <Field label="Исключить комнаты из анализа" hint={excluded.length ? `Исключено комнат: ${excluded.length}. Остальные ваши комнаты читаются, а ИИ отбирает из них только рабочие сообщения.` : "Сейчас читаются все ваши комнаты. Загрузите список и отметьте те, что не нужны: личные чаты, общие и развлекательные каналы."}>
        <div className="row"><Button size="small" onClick={load}>Загрузить список комнат…</Button><Status text={status} /></div>
      </Field>
      {rooms && (
        <div className="rooms">
          <input placeholder="Фильтр по названию" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="room-list">
            {shown.map((r) => (
              <label key={r.id} className="check">
                <input type="checkbox" checked={excluded.includes(r.id)}
                  onChange={(e) => set("matrixExcludeRooms", e.target.checked ? [...excluded, r.id] : excluded.filter((x) => x !== r.id))} />
                <span className={excluded.includes(r.id) ? "excluded" : ""}>{r.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
