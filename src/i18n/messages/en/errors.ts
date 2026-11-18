import type ru from "../ru/errors";
import type { ErrorParams } from "../ru/errors";

type Msg = (p: ErrorParams) => string;

const secret: Record<string, string> = {
  jira_pat: "Jira",
  llm_key: "AI",
  matrix_token: "Matrix",
  confluence_pat: "Confluence",
  exchange_password: "Mail",
  gitlab_pat: "GitLab",
};
const secretLabel = (name: unknown) => secret[String(name)] ?? String(name);

const codes: Record<string, Msg> = {
  raw: (p) => `${p.detail ?? ""}`,
  service: (p) => `${p.service}: ${p.detail}`,
  http: (p) => `${p.service} HTTP ${p.status}: ${p.body}`,
  browserOpen: (p) => `Couldn't open the browser (${p.detail}). Open it manually: ${p.url}`,
  keychainNotSaved: (p) =>
    `The system password store did not store "${p.secret}" (${p.length} chars). Make sure the app runs under your own user account.`,
  tokenMissing: (p) => `${secretLabel(p.secret)}: no token in settings`,
  unknownSecret: (p) => `Unknown secret: ${p.secret}`,
  taskDocInvalid: (p) => `This file cannot be read: ${p.path}`,
  openLinkInvalid: (p) => `This link cannot be opened: ${p.url}`,
  worklogBadTime: (p) => `Cannot book this time: ${p.seconds} s`,
  worklogBadTarget: (p) => `Invalid task or worklog: ${p.key}`,
  unknownService: (p) => `Unknown service: ${p.service}`,
  openIssueInvalid: () => "Couldn't open the issue: invalid key or no Jira address set",
  urlMissing: (p) => `${p.service}: no address set`,
  exchangeNotConfigured: () => "Exchange: set the mail address and login in settings",
  exchangeUnauthorized: () =>
    "Exchange: 401 — login or password rejected. Login format: DOMAIN\\login or login@company.com. " +
    "If the password is surely right, the server may require NTLM/Kerberos instead of Basic — let us know and we'll add it.",
  exchangeVersion: () => "Exchange: the server doesn't support the requested protocol version",
  exchangeNotXml: () => "Exchange returned something other than XML — probably a sign-in page. Check the address and login/password.",
  llmNoContent: (p) => `LLM: no content in the reply: ${p.body}`,
  llmNoAnswer: () => "LLM: no reply received",
  holidaysCountry: (p) => `Country "${p.country}" is not supported`,
  periodReversed: () => "The period ends before it starts",
  holidaysUnavailable: (p) => `isdayoff.ru is unavailable (${p.detail}) and there is no built-in data for this year`,
  matrixUnauthorized: (p) =>
    `Matrix: the server rejects the token (401: ${p.body}). It expired, was revoked, or the session it came from was closed. ` +
    "Get a new one: Settings → Matrix → expand \"Token rejected or expired? Get a new one here\".",
  matrixLoginFailed: (p) => `Matrix sign-in failed (HTTP ${p.status}): ${p.body}`,
  matrixNoAccessToken: () => "Matrix: no access_token in the reply",
  matrixNoPasswordLogin: () => "The server doesn't accept password sign-in. Use \"Sign in with SSO\".",
  matrixNoSso: () => "The server doesn't offer SSO sign-in. Try signing in with a password.",
  matrixLoginTimeout: () => "Sign-in timed out (4 minutes). Please try again.",
  gitlabUnauthorized: () => "GitLab: 401 — token rejected or expired (read_api scope is required)",
  gitStart: (p) => `git failed to start: ${p.detail}`,
  repoNotFound: (p) => `Repository not found: ${p.path}`,
  folderNotFound: (p) => `Folder not found: ${p.path}`,
};

const en: typeof ru = {
  codes,
  unknown: (code: string, details: string) => `Error ${code}${details ? `: ${details}` : ""}`,
  probe: {
    user: (name: string) => `OK: ${name}`,
    meetings: (count: number) => `OK: connected, meetings within ±1 day: ${count}`,
    reply: (text: string) => `OK: ${text}`,
  },
};

export default en;
