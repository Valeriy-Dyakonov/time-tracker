//! Tokens live in the OS keychain (Windows Credential Manager / macOS Keychain /
//! Secret Service on Linux). They are never written to settings.json and never
//! returned to the frontend.
//!
//! Windows Credential Manager stores at most 2560 bytes per entry (UTF-16, so ~1280 characters).
//! Long tokens (JWT-like Matrix tokens) are therefore split into chunks `name#0`, `name#1`, …
//! and the main entry `name` holds a small header with the chunk count.
//! After every write the value is read back, so a silent failure becomes a visible error.
const SERVICE: &str = "worklog-tracker";
const DIRECT_MAX: usize = 900; // chars stored in a single entry
const CHUNK: usize = 450;
const HEADER: &str = "\u{1}chunks:";

pub trait Store {
    fn get(&self, key: &str) -> Option<String>;
    fn put(&self, key: &str, value: &str) -> Result<(), String>;
    fn del(&self, key: &str);
}

struct Keychain;

impl Store for Keychain {
    fn get(&self, key: &str) -> Option<String> {
        keyring::Entry::new(SERVICE, key).ok()?.get_password().ok().filter(|s| !s.is_empty())
    }
    fn put(&self, key: &str, value: &str) -> Result<(), String> {
        let e = keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
        e.set_password(value).map_err(|e| e.to_string())
    }
    fn del(&self, key: &str) {
        if let Ok(e) = keyring::Entry::new(SERVICE, key) {
            let _ = e.delete_credential();
        }
    }
}

fn chunk_count(main: &str) -> Option<usize> {
    main.strip_prefix(HEADER)?.parse().ok()
}

pub fn clear_in(s: &dyn Store, name: &str) {
    if let Some(n) = s.get(name).as_deref().and_then(chunk_count) {
        for i in 0..n.min(64) {
            s.del(&format!("{name}#{i}"));
        }
    }
    s.del(name);
}

pub fn get_in(s: &dyn Store, name: &str) -> Option<String> {
    let main = s.get(name)?;
    match chunk_count(&main) {
        None => Some(main),
        Some(n) => {
            let mut out = String::new();
            for i in 0..n {
                out.push_str(&s.get(&format!("{name}#{i}"))?);
            }
            Some(out)
        }
    }
}

pub fn set_in(s: &dyn Store, name: &str, value: &str) -> Result<(), String> {
    clear_in(s, name);
    if value.is_empty() {
        return Ok(());
    }
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= DIRECT_MAX {
        s.put(name, value)?;
    } else {
        let parts: Vec<String> = chars.chunks(CHUNK).map(|c| c.iter().collect()).collect();
        for (i, p) in parts.iter().enumerate() {
            s.put(&format!("{name}#{i}"), p)?;
        }
        s.put(name, &format!("{HEADER}{}", parts.len()))?;
    }
    match get_in(s, name) {
        Some(back) if back == value => Ok(()),
        _ => Err(format!(
            "Хранилище паролей Windows не сохранило значение «{name}» (длина {} симв.). Проверьте, что приложение запущено под вашим пользователем.",
            chars.len()
        )),
    }
}

pub fn set(name: &str, value: &str) -> Result<(), String> {
    set_in(&Keychain, name, value)
}

pub fn get(name: &str) -> Option<String> {
    get_in(&Keychain, name)
}

/// A keychain entry and the service name shown when it is missing.
pub struct Secret {
    pub name: &'static str,
    pub label: &'static str,
}

pub const JIRA: Secret = Secret { name: "jira_pat", label: "Jira" };
pub const LLM: Secret = Secret { name: "llm_key", label: "ИИ" };
pub const MATRIX: Secret = Secret { name: "matrix_token", label: "Matrix" };
pub const CONFLUENCE: Secret = Secret { name: "confluence_pat", label: "Confluence" };
pub const EXCHANGE: Secret = Secret { name: "exchange_password", label: "Почта" };
pub const GITLAB: Secret = Secret { name: "gitlab_pat", label: "GitLab" };

pub const ALL: [&Secret; 6] = [&JIRA, &LLM, &MATRIX, &CONFLUENCE, &EXCHANGE, &GITLAB];

pub fn is_known(name: &str) -> bool {
    ALL.iter().any(|s| s.name == name)
}

pub fn require(secret: &Secret) -> Result<String, String> {
    get(secret.name).ok_or_else(|| format!("{}: токен не задан в настройках", secret.label))
}
