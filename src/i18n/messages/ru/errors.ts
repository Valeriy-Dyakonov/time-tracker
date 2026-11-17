/** Parameters the backend sends with an error code (see src-tauri/src/error.rs). */
export type ErrorParams = Record<string, string | number | undefined>;
type Msg = (p: ErrorParams) => string;

const secret: Record<string, string> = {
  jira_pat: "Jira",
  llm_key: "ИИ",
  matrix_token: "Matrix",
  confluence_pat: "Confluence",
  exchange_password: "Почта",
  gitlab_pat: "GitLab",
};
const secretLabel = (name: unknown) => secret[String(name)] ?? String(name);

const codes: Record<string, Msg> = {
  raw: (p) => `${p.detail ?? ""}`,
  service: (p) => `${p.service}: ${p.detail}`,
  http: (p) => `${p.service} HTTP ${p.status}: ${p.body}`,
  browserOpen: (p) => `Не удалось открыть браузер (${p.detail}). Откройте вручную: ${p.url}`,
  keychainNotSaved: (p) =>
    `Хранилище паролей Windows не сохранило значение «${p.secret}» (длина ${p.length} симв.). Проверьте, что приложение запущено под вашим пользователем.`,
  tokenMissing: (p) => `${secretLabel(p.secret)}: токен не задан в настройках`,
  unknownSecret: (p) => `Неизвестный секрет: ${p.secret}`,
  unknownService: (p) => `Неизвестный сервис: ${p.service}`,
  openIssueInvalid: () => "Не удалось открыть задачу: неверный ключ или не задан адрес Jira",
  urlMissing: (p) => `${p.service}: не задан адрес`,
  exchangeNotConfigured: () => "Exchange: укажите адрес почты и логин в настройках",
  exchangeUnauthorized: () =>
    "Exchange: 401 — логин или пароль не приняты. Формат логина: ДОМЕН\\логин или логин@компания.ru. " +
    "Если пароль точно верный, возможно сервер требует NTLM/Kerberos вместо Basic — напишите об этом, добавим.",
  exchangeVersion: () => "Exchange: сервер не поддерживает запрошенную версию протокола",
  exchangeNotXml: () => "Exchange вернул не XML — похоже, это страница входа. Проверьте адрес и логин/пароль.",
  llmNoContent: (p) => `LLM: нет content в ответе: ${p.body}`,
  llmNoAnswer: () => "LLM: не удалось получить ответ",
  holidaysCountry: (p) => `Страна «${p.country}» не поддерживается`,
  periodReversed: () => "Конец периода раньше начала",
  holidaysUnavailable: (p) => `isdayoff.ru недоступен (${p.detail}), встроенных данных для этого года нет`,
  matrixUnauthorized: (p) =>
    `Matrix: сервер не принимает токен (401: ${p.body}). Он истёк, отозван или сессия, из которой его скопировали, закрыта. ` +
    "Получите новый: Настройки → Matrix → раскройте «Токен не подходит или истёк? Получить новый здесь».",
  matrixLoginFailed: (p) => `Matrix вход не удался (HTTP ${p.status}): ${p.body}`,
  matrixNoAccessToken: () => "Matrix: в ответе нет access_token",
  matrixNoPasswordLogin: () => "Сервер не принимает вход по паролю. Используйте «Войти через SSO».",
  matrixNoSso: () => "Сервер не предлагает вход через SSO. Попробуйте вход по паролю.",
  matrixLoginTimeout: () => "Время ожидания входа истекло (4 минуты). Попробуйте ещё раз.",
  gitlabUnauthorized: () => "GitLab: 401 — токен не принят или истёк (нужны права read_api)",
  gitStart: (p) => `git не запустился: ${p.detail}`,
  repoNotFound: (p) => `Репозиторий не найден: ${p.path}`,
  folderNotFound: (p) => `Папка не найдена: ${p.path}`,
};

export default {
  codes,
  /** A code this version of the UI does not know (newer backend). */
  unknown: (code: string, details: string) => `Ошибка ${code}${details ? `: ${details}` : ""}`,
  probe: {
    user: (name: string) => `OK: ${name}`,
    meetings: (count: number) => `OK: подключено, встреч в ближайшие сутки (±1 день): ${count}`,
    reply: (text: string) => `OK: ${text}`,
  },
};
