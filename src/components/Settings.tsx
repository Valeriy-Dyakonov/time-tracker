import { useEffect, useState } from "react";
import { api, type RepoInfo, type Room } from "../api";
import type { Settings as S } from "../types";
import { setupState } from "../lib/setup";
import Help from "./Help";
import { Field } from "./ui";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type Section = "jira" | "llm" | "git" | "gitlab" | "matrix" | "confluence" | "calendar" | "work";
type Svc = "jira" | "llm" | "gitlab" | "matrix" | "confluence" | "calendar";
const EMPTY_TOK = { jira_pat: "", llm_key: "", matrix_token: "", confluence_pat: "", exchange_password: "", gitlab_pat: "" };

function Status({ text }: { text?: string }) {
  if (!text) return null;
  const cls = text.startsWith("✓") ? "status ok" : text.startsWith("✗") ? "status err" : "status";
  return <span className={cls}>{text}</span>;
}

export default function Settings(props: { settings: S; onSaved: (s: S) => void }) {
  const [s, setS] = useState<S>(props.settings);
  const [tok, setTok] = useState(EMPTY_TOK);
  const [stored, setStored] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomFilter, setRoomFilter] = useState("");
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [repoFilter, setRepoFilter] = useState("");
  const [section, setSection] = useState<Section>("jira");
  const [ctxText, setCtxText] = useState(props.settings.contextProjects.join(", "));
  const [pwUser, setPwUser] = useState("");
  const [pw, setPw] = useState("");

  const refresh = () => api.secretsStatus().then(setStored).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const set = <K extends keyof S>(k: K, v: S[K]) => setS((p) => ({ ...p, [k]: v }));
  const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
  const dirty = JSON.stringify(s) !== JSON.stringify(props.settings) || Object.values(tok).some(Boolean);

  // Tokens typed but not yet saved already count as "filled in".
  const effStored = { ...stored, ...Object.fromEntries(Object.entries(tok).filter(([, v]) => v).map(([k]) => [k, true])) };
  const ready = setupState(s, effStored);

  /** Saves settings and tokens; throws on failure so callers can show the reason. */
  async function persist() {
    await api.saveSettings(s);
    const saved: string[] = [];
    for (const [name, value] of Object.entries(tok)) {
      if (!value) continue;
      await api.setSecret(name, value.trim()); // Rust reads the value back and fails loudly if the keychain dropped it
      saved.push(name);
    }
    // Clear only what was really written; a failed token stays in the field.
    setTok(EMPTY_TOK);
    await refresh();
    props.onSaved(s);
    return saved;
  }

  async function save() {
    setMsg((m) => ({ ...m, save: "Сохраняю…" }));
    try {
      const saved = await persist();
      setMsg((m) => ({ ...m, save: `✓ Сохранено${saved.length ? `, токены обновлены: ${saved.length}` : ""}` }));
      setTimeout(() => setMsg((m) => ({ ...m, save: "" })), 3500);
    } catch (e) {
      setMsg((m) => ({ ...m, save: "✗ Не сохранилось: " + e }));
    }
  }

  async function test(svc: Svc) {
    setMsg((m) => ({ ...m, [svc]: "Проверяю…" }));
    try {
      await persist();
      const res = await api.testConnection(svc);
      setMsg((m) => ({ ...m, [svc]: "✓ " + res }));
    } catch (e) {
      setMsg((m) => ({ ...m, [svc]: "✗ " + e }));
    }
  }

  async function matrixLogin(kind: "sso" | "pw") {
    setMsg((m) => ({ ...m, mlogin: kind === "sso" ? "Открыл браузер — войдите там, у вас 4 минуты…" : "Вхожу…" }));
    try {
      await api.saveSettings(s); // the server address must be saved first
      const id = kind === "sso" ? await api.matrixLoginSso() : await api.matrixLoginPassword(pwUser, pw);
      setPw("");
      await refresh();
      const next = id ? { ...s, matrixUserId: id } : s;
      setS(next);
      props.onSaved(next);
      setMsg((m) => ({ ...m, mlogin: `✓ Токен получен и сохранён${id ? " для " + id : ""}. Нажмите «Проверить подключение».` }));
    } catch (e) {
      setMsg((m) => ({ ...m, mlogin: "✗ " + e }));
    }
  }

  async function removeToken(name: string) {
    await api.setSecret(name, "");
    refresh();
  }

  async function loadRooms() {
    setMsg((m) => ({ ...m, rooms: "Загружаю комнаты…" }));
    try {
      await persist();
      setRooms(await api.listMatrixRooms());
      setMsg((m) => ({ ...m, rooms: "" }));
    } catch (e) {
      setMsg((m) => ({ ...m, rooms: "✗ " + e }));
    }
  }

  async function scanRepos() {
    setMsg((m) => ({ ...m, repos: "Ищу репозитории…" }));
    try {
      const found = await api.scanGitRepos(s.gitRoot);
      setRepos(found);
      setMsg((m) => ({ ...m, repos: `✓ Найдено: ${found.length}` }));
    } catch (e) {
      setMsg((m) => ({ ...m, repos: "✗ " + e }));
    }
  }

  const tokenField = (name: keyof typeof tok, label: string, hint?: string, noun = "Токен") => (
    <Field label={label} hint={stored[name] ? `✓ ${noun} сохранён в Windows Credential Manager. Чтобы заменить — введите новый.` : hint ?? "Хранится в системном хранилище паролей, не в файле настроек."}>
      <div className="row">
        <input type="password" autoComplete="off" value={tok[name]} placeholder={stored[name] ? "••••••••••" : `Вставьте ${noun.toLowerCase()}`} onChange={(e) => setTok({ ...tok, [name]: e.target.value })} />
        {stored[name] && <button className="btn small ghost" onClick={() => removeToken(name)}>Удалить</button>}
      </div>
    </Field>
  );

  const shownRooms = (rooms ?? []).filter((r) => r.name.toLowerCase().includes(roomFilter.toLowerCase()));
  const shownRepos = (repos ?? []).filter((r) => r.name.toLowerCase().includes(repoFilter.toLowerCase()));
  const toggleRepo = (path: string, on: boolean) =>
    set("gitRepos", on ? [...new Set([...s.gitRepos, path])] : s.gitRepos.filter((x) => x !== path));

  const nav: { id: Section; label: string; sub: string; ok: boolean; req?: boolean }[] = [
    { id: "jira", label: "Jira", sub: ready.jira ? "подключена" : "обязательно", ok: ready.jira, req: true },
    { id: "llm", label: "Корпоративный ИИ", sub: ready.llm ? s.llmModel : "рекомендуется", ok: ready.llm },
    { id: "git", label: "Git", sub: ready.git ? `репозиториев: ${s.gitRepos.length}` : "необязательно", ok: ready.git },
    { id: "gitlab", label: "GitLab", sub: ready.gitlab ? (s.gitlabLocalOnly ? "MR ваших репозиториев" : "все проекты") : "необязательно", ok: ready.gitlab },
    { id: "matrix", label: "Matrix", sub: ready.matrix ? (s.matrixExcludeRooms.length ? `исключено: ${s.matrixExcludeRooms.length}` : "все комнаты") : "необязательно", ok: ready.matrix },
    { id: "confluence", label: "Confluence", sub: ready.confluence ? "подключён" : "необязательно", ok: ready.confluence },
    { id: "calendar", label: "Почта и календарь", sub: ready.calendar ? (s.calendarOnlyCalls ? "только звонки" : "звонки и встречи") : "необязательно", ok: ready.calendar },
    { id: "work", label: "Рабочее время", sub: `${s.hoursPerDay} ч · ${s.workdays.length} дн./нед.`, ok: true },
  ];

  return (
    <div className="settings-layout">
      <nav className="sidenav">
        {nav.map((n) => (
          <button key={n.id} className={`sideitem ${section === n.id ? "active" : ""}`} onClick={() => setSection(n.id)}>
            <span className={`mark ${n.ok ? "ok" : n.req ? "req" : "off"}`}>{n.ok ? "✓" : n.req ? "!" : "○"}</span>
            <span className="lbl">{n.label}<small>{n.sub}</small></span>
          </button>
        ))}
        <p className="side-note">Все подключения только читают данные и ничего не меняют.</p>
      </nav>
      <div className="settings-main">


      {section === "jira" && (
      <section className="card">
        <h3>Jira <span className="badge req">обязательно</span></h3>
        <Field label="Адрес Jira" hint="Адрес, по которому вы заходите в Jira в браузере.">
          <input value={s.jiraUrl} placeholder="https://jira.company.ru" onChange={(e) => set("jiraUrl", e.target.value)} />
        </Field>
        {tokenField("jira_pat", "Personal Access Token")}
        <Field label="Проекты только для контекста" hint="Ключи проектов через запятую, например OPS, LEGACY. События по ним (коммиты, чат, звонки) останутся подсказкой для ИИ, но часы на такие задачи не начисляются. Подходит для чужих проектов и задач без права списывать время.">
          <input
            value={ctxText}
            placeholder="OPS, LEGACY"
            onChange={(e) => {
              setCtxText(e.target.value);
              set("contextProjects", [...new Set(e.target.value.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))]);
            }}
          />
        </Field>
        <Help
          title="Где взять токен Jira"
          steps={[
            "Откройте Jira в браузере и войдите под своей учётной записью.",
            "Нажмите на свой аватар в правом верхнем углу → «Профиль» (Profile).",
            "В меню слева выберите «Personal Access Tokens» («Персональные токены доступа»).",
            "Нажмите «Create token», задайте имя (например, Worklog Tracker) и срок действия.",
            "Скопируйте показанный токен и вставьте сюда. Jira показывает его только один раз.",
          ]}
          note="Токен даёт те же права, что и ваша учётка; приложение использует его только для чтения. Если пункта «Personal Access Tokens» нет — функция выключена администратором или Jira старше версии 8.14: попросите администратора включить её или выдать токен."
        />
        <div className="row"><button className="btn small" onClick={() => test("jira")}>Проверить подключение</button><Status text={msg.jira} /></div>
      </section>
      )}

      {section === "llm" && (
      <section className="card">
        <h3>Корпоративный ИИ <span className="badge opt">рекомендуется</span></h3>
        <Field label="Base URL" hint="Адрес API до /chat/completions, обычно заканчивается на /v1.">
          <input value={s.llmBaseUrl} placeholder="https://ai.company.ru/v1" onChange={(e) => set("llmBaseUrl", e.target.value)} />
        </Field>
        <Field label="Модель" hint="Точное имя модели, как её принимает API.">
          <input value={s.llmModel} onChange={(e) => set("llmModel", e.target.value)} />
        </Field>
        {tokenField("llm_key", "API key", "Если шлюз не требует ключ — оставьте пустым.")}
        <Help
          title="Где взять адрес, модель и ключ"
          steps={[
            "Эти данные выдаёт команда, которая поддерживает корпоративный ИИ: спросите у них «адрес OpenAI-совместимого API, имя модели и API-ключ».",
            "Если вы уже пользуетесь OpenCode, те же значения обычно лежат в его конфиге opencode.json (раздел provider: baseURL, apiKey и список models). Файл ищите в папке .config\\opencode в вашем профиле Windows или в корне проекта.",
            "Список доступных моделей можно получить запросом GET <Base URL>/models.",
            "Нажмите «Проверить подключение» — приложение отправит короткий тестовый запрос.",
          ]}
          note="Без ИИ приложение тоже работает: часы распределяются эвристикой по числу действий и коммитов, но менее точно."
        />
        <div className="row"><button className="btn small" onClick={() => test("llm")}>Проверить подключение</button><Status text={msg.llm} /></div>
      </section>
      )}

      {section === "git" && (
      <section className="card">
        <h3>Git <span className="badge opt">необязательно</span></h3>
        <Field label="Папка с репозиториями" hint="Приложение найдёт все git-репозитории внутри (до 3 уровней вглубь).">
          <div className="row">
            <input value={s.gitRoot} placeholder="C:\Work" onChange={(e) => set("gitRoot", e.target.value)} />
            <button className="btn small" onClick={scanRepos}>Найти</button>
          </div>
          <Status text={msg.repos} />
        </Field>
        {repos && (
          <div className="rooms">
            <div className="row">
              <input placeholder="Фильтр по имени" value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)} />
              <button className="btn small ghost" onClick={() => set("gitRepos", [...new Set([...s.gitRepos, ...shownRepos.map((r) => r.path)])])}>Выбрать все</button>
              <button className="btn small ghost" onClick={() => set("gitRepos", s.gitRepos.filter((p) => !shownRepos.some((r) => r.path === p)))}>Снять</button>
            </div>
            <div className="room-list">
              {shownRepos.map((r) => (
                <label key={r.path} className="check" title={r.path}>
                  <input type="checkbox" checked={s.gitRepos.includes(r.path)} onChange={(e) => toggleRepo(r.path, e.target.checked)} />
                  {r.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <Field label="Выбранные репозитории" hint={`Выбрано: ${s.gitRepos.length}. Можно дописать путь вручную, по одному на строку.`}>
          <textarea rows={3} value={s.gitRepos.join("\n")} onChange={(e) => set("gitRepos", lines(e.target.value))} />
        </Field>
        <Field label="Автор коммитов" hint="Чтобы не искать вручную — оставьте пустым: возьмётся email из git config каждого репозитория.">
          <textarea rows={2} value={s.gitAuthors.join("\n")} placeholder="ivan@company.ru" onChange={(e) => set("gitAuthors", lines(e.target.value))} />
        </Field>
        <Help
          title="Как узнать свой email в git"
          steps={["Откройте терминал в любом из репозиториев и выполните: git config user.email", "Если коммитите с разных адресов — впишите каждый с новой строки."]}
        />
      </section>
      )}

      {section === "matrix" && (
      <section className="card">
        <h3>Matrix <span className="badge opt">необязательно</span></h3>
        <Field label="Homeserver" hint="Адрес вашего Matrix-сервера.">
          <input value={s.matrixHomeserver} placeholder="https://matrix.company.ru" onChange={(e) => set("matrixHomeserver", e.target.value)} />
        </Field>
        <Field label="Ваш Matrix ID" hint="Выглядит как @логин:домен.">
          <input value={s.matrixUserId} placeholder="@ivan:company.ru" onChange={(e) => set("matrixUserId", e.target.value)} />
        </Field>
        {tokenField("matrix_token", "Access token")}
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
        <div className="row"><button className="btn small" onClick={() => test("matrix")}>Проверить подключение</button><Status text={msg.matrix} /></div>
        <details className="help" open={!!msg.matrix?.startsWith("✗") || !!msg.mlogin}>
          <summary>Токен не подходит или истёк? Получить новый здесь</summary>
          <p className="note">Приложение войдёт так же, как это делает Element, и само сохранит токен. Это отдельная сессия «Worklog Tracker»: она не зависит от вашего Element, и выход из него её не сломает. Сначала заполните Homeserver выше.</p>
          <div className="row"><button className="btn small" disabled={!s.matrixHomeserver.trim()} onClick={() => matrixLogin("sso")}>Войти через SSO (откроется браузер)</button></div>
          <div className="row wrap">
            <input style={{ width: 150 }} placeholder="логин" value={pwUser} onChange={(e) => setPwUser(e.target.value)} />
            <input style={{ width: 150 }} type="password" placeholder="пароль" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button className="btn small" disabled={!s.matrixHomeserver.trim() || !pwUser || !pw} onClick={() => matrixLogin("pw")}>Войти по паролю</button>
          </div>
          <p className="note">Пароль используется один раз и нигде не сохраняется. Если у вас вход только через корпоративный SSO — выбирайте первый вариант.</p>
          <Status text={msg.mlogin} />
        </details>
        <Field label="Исключить комнаты из анализа" hint={s.matrixExcludeRooms.length ? `Исключено комнат: ${s.matrixExcludeRooms.length}. Остальные ваши комнаты читаются, а ИИ отбирает из них только рабочие сообщения.` : "Сейчас читаются все ваши комнаты. Загрузите список и отметьте те, что не нужны: личные чаты, общие и развлекательные каналы."}>
          <div className="row"><button className="btn small" onClick={loadRooms}>Загрузить список комнат…</button><Status text={msg.rooms} /></div>
        </Field>
        {rooms && (
          <div className="rooms">
            <input placeholder="Фильтр по названию" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} />
            <div className="room-list">
              {shownRooms.map((r) => (
                <label key={r.id} className="check">
                  <input type="checkbox" checked={s.matrixExcludeRooms.includes(r.id)}
                    onChange={(e) => set("matrixExcludeRooms", e.target.checked ? [...s.matrixExcludeRooms, r.id] : s.matrixExcludeRooms.filter((x) => x !== r.id))} />
                  <span className={s.matrixExcludeRooms.includes(r.id) ? "excluded" : ""}>{r.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>
      )}

      {section === "gitlab" && (
      <section className="card">
        <h3>GitLab <span className="badge opt">необязательно</span></h3>
        <Field label="Адрес GitLab" hint="MR, которые вы создали, одобрили или комментировали при ревью. В названии или ветке MR обычно есть ключ задачи, так ревью попадает в нужный день и на нужную задачу.">
          <input value={s.gitlabUrl} placeholder="https://gitlab.company.ru" onChange={(e) => set("gitlabUrl", e.target.value)} />
        </Field>
        {tokenField("gitlab_pat", "Personal Access Token")}
        <label className="check" style={{ margin: "4px 0 12px" }}>
          <input type="checkbox" checked={s.gitlabLocalOnly} onChange={(e) => set("gitlabLocalOnly", e.target.checked)} />
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
        <div className="row"><button className="btn small" onClick={() => test("gitlab")}>Проверить подключение</button><Status text={msg.gitlab} /></div>
      </section>
      )}

      {section === "confluence" && (
      <section className="card">
        <h3>Confluence <span className="badge opt">необязательно</span></h3>
        <Field label="Адрес Confluence" hint="Страницы и комментарии, которые вы создали или правили, попадут в контекст анализа.">
          <input value={s.confluenceUrl} placeholder="https://confluence.company.ru" onChange={(e) => set("confluenceUrl", e.target.value)} />
        </Field>
        {tokenField("confluence_pat", "Personal Access Token")}
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
        <div className="row"><button className="btn small" onClick={() => test("confluence")}>Проверить подключение</button><Status text={msg.confluence} /></div>
      </section>
      )}

      {section === "calendar" && (
      <section className="card">
        <h3>Почта и календарь (Exchange) <span className="badge opt">необязательно</span></h3>
        <Field label="Адрес почты" hint="Адрес, по которому вы открываете Outlook в браузере, например https://mail.company.ru. Путь /EWS/Exchange.asmx допишется сам.">
          <input value={s.exchangeUrl} placeholder="https://mail.company.ru" onChange={(e) => set("exchangeUrl", e.target.value)} />
        </Field>
        <Field label="Логин" hint="Тот же, что при входе в Outlook: ДОМЕН\логин или логин@company.ru.">
          <input value={s.exchangeUser} placeholder="COMPANY\\ivan" onChange={(e) => set("exchangeUser", e.target.value)} />
        </Field>
        {tokenField("exchange_password", "Пароль", "Хранится в системном хранилище паролей, не в файле настроек.", "Пароль")}
        <label className="check">
          <input type="checkbox" checked={s.calendarOnlyCalls} onChange={(e) => set("calendarOnlyCalls", e.target.checked)} />
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
        <div className="row"><button className="btn small" onClick={() => test("calendar")}>Проверить подключение</button><Status text={msg.calendar} /></div>
      </section>
      )}

      {section === "work" && (
      <section className="card">
        <h3>Рабочее время</h3>
        <Field label="Часов в день по умолчанию" hint="Именно столько будет списано в каждый рабочий день.">
          <input type="number" min={1} max={24} step={0.25} value={s.hoursPerDay} onChange={(e) => set("hoursPerDay", Number(e.target.value) || 8)} />
        </Field>
        <Field label="Рабочие дни">
          <div className="row wrap">
            {DAYS.map((d, i) => (
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
      </section>
      )}

      <div className="savebar">
        <button className="btn primary" onClick={save} disabled={!dirty}>Сохранить</button>
        {dirty && <span className="status">Есть несохранённые изменения</span>}
        <Status text={msg.save} />
      </div>
      </div>
    </div>
  );
}
