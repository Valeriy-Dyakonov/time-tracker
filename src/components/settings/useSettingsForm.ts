import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Settings } from "../../types";
import { setupState, type SetupState } from "../../lib/setup";

export const EMPTY_TOKENS = { jira_pat: "", llm_key: "", matrix_token: "", confluence_pat: "", exchange_password: "", gitlab_pat: "" };
export type TokenName = keyof typeof EMPTY_TOKENS;
export type Service = "jira" | "llm" | "gitlab" | "matrix" | "confluence" | "calendar";

/** Draft settings, typed-but-unsaved tokens and per-action status messages shared by all settings sections. */
export function useSettingsForm(initial: Settings, onSaved: (s: Settings) => void) {
  const [s, setS] = useState<Settings>(initial);
  const [tok, setTok] = useState(EMPTY_TOKENS);
  const [stored, setStored] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});

  const refresh = () => api.secretsStatus().then(setStored).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  const say = (key: string, text: string) => setMsg((m) => ({ ...m, [key]: text }));
  const dirty = JSON.stringify(s) !== JSON.stringify(initial) || Object.values(tok).some(Boolean);

  // Tokens typed but not yet saved already count as "filled in".
  const typed = Object.fromEntries(Object.entries(tok).filter(([, v]) => v).map(([k]) => [k, true]));
  const ready: SetupState = setupState(s, { ...stored, ...typed });

  /** Saves settings and tokens; throws on failure so callers can show the reason. */
  async function persist(): Promise<string[]> {
    await api.saveSettings(s);
    const saved: string[] = [];
    for (const [name, value] of Object.entries(tok)) {
      if (!value) continue;
      await api.setSecret(name, value.trim()); // Rust reads the value back and fails loudly if the keychain dropped it
      saved.push(name);
    }
    // Reached only when every token was written, so a token that failed stays in its field.
    setTok(EMPTY_TOKENS);
    await refresh();
    onSaved(s);
    return saved;
  }

  async function save() {
    say("save", "Сохраняю…");
    try {
      const saved = await persist();
      say("save", `✓ Сохранено${saved.length ? `, токены обновлены: ${saved.length}` : ""}`);
      setTimeout(() => say("save", ""), 3500);
    } catch (e) {
      say("save", "✗ Не сохранилось: " + e);
    }
  }

  async function test(svc: Service) {
    say(svc, "Проверяю…");
    try {
      await persist();
      say(svc, "✓ " + (await api.testConnection(svc)));
    } catch (e) {
      say(svc, "✗ " + e);
    }
  }

  async function removeToken(name: TokenName) {
    await api.setSecret(name, "");
    refresh();
  }

  /** Replaces the draft and treats it as saved (used after flows that save on the backend side). */
  function adopt(next: Settings) {
    setS(next);
    onSaved(next);
  }

  return { s, set, tok, setTok, stored, msg, say, dirty, ready, persist, save, test, removeToken, refresh, adopt };
}

export type SettingsForm = ReturnType<typeof useSettingsForm>;
