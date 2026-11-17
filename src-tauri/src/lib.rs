mod calendar;
mod confluence;
mod gitlab;
mod holidays;
mod gitlog;
mod jira;
mod llm;
mod matrix;
mod matrix_sso;
mod secrets;
mod settings;
mod util;

use settings::{Event, IssueInfo, Settings};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const SECRET_NAMES: [&str; 6] = ["jira_pat", "llm_key", "matrix_token", "confluence_pat", "exchange_password", "gitlab_pat"];

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn load(app: &tauri::AppHandle) -> Result<Settings, String> {
    let p = settings_path(app)?;
    if !p.exists() {
        return Ok(Settings::default());
    }
    let s = fs::read_to_string(p).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

fn need(name: &str, label: &str) -> Result<String, String> {
    secrets::get(name).ok_or_else(|| format!("{label}: токен не задан в настройках"))
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    load(&app)
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let s = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(settings_path(&app)?, s).map_err(|e| e.to_string())
}

/// Stores a token in the OS keychain. An empty value removes it.
#[tauri::command]
fn set_secret(name: String, value: String) -> Result<(), String> {
    if !SECRET_NAMES.contains(&name.as_str()) {
        return Err("unknown secret".into());
    }
    secrets::set(&name, &value)
}

/// Tells the UI which tokens are present without revealing them.
#[tauri::command]
fn secrets_status() -> std::collections::HashMap<String, bool> {
    SECRET_NAMES
        .iter()
        .map(|n| (n.to_string(), secrets::get(n).is_some()))
        .collect()
}

#[tauri::command]
async fn test_connection(app: tauri::AppHandle, service: String) -> Result<String, String> {
    let s = load(&app)?;
    let client = util::client(s.accept_invalid_certs)?;
    match service.as_str() {
        "jira" => jira::test(&client, &s.jira_url, &need("jira_pat", "Jira")?).await,
        "calendar" => {
            calendar::test(&client, &s.exchange_url, &s.exchange_user, &need("exchange_password", "Почта")?).await
        }
        "gitlab" => gitlab::test(&client, &s.gitlab_url, &need("gitlab_pat", "GitLab")?).await,
        "confluence" => {
            confluence::test(&client, &s.confluence_url, &need("confluence_pat", "Confluence")?).await
        }
        "matrix" => matrix::test(&client, &s.matrix_homeserver, &need("matrix_token", "Matrix")?).await,
        "llm" => {
            let key = secrets::get("llm_key");
            let r = llm::chat(
                &client,
                &s.llm_base_url,
                key.as_deref(),
                &s.llm_model,
                "Reply with a JSON object.",
                "{\"ping\": true} -> reply {\"pong\": true}",
            )
            .await?;
            Ok(format!("OK: {}", util::truncate(&r, 80)))
        }
        _ => Err("unknown service".into()),
    }
}

/// Opens `<jira>/browse/<KEY>` in the default browser. The key is validated, the host is always the configured Jira.
#[tauri::command]
fn open_issue(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let s = load(&app)?;
    let valid = key.len() <= 40
        && key.contains('-')
        && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid || s.jira_url.trim().is_empty() {
        return Err("Не удалось открыть задачу: неверный ключ или не задан адрес Jira".into());
    }
    matrix_sso::open_browser(&format!("{}/browse/{}", util::trim_url(&s.jira_url), key))
}

#[tauri::command]
async fn fetch_jira(app: tauri::AppHandle, start: String, end: String) -> Result<jira::JiraResult, String> {
    let s = load(&app)?;
    let (a, b) = util::range_ms(&start, &end)?;
    let client = util::client(s.accept_invalid_certs)?;
    jira::fetch(&client, &s.jira_url, &need("jira_pat", "Jira")?, &start, a, b).await
}

#[tauri::command]
async fn lookup_issues(app: tauri::AppHandle, keys: Vec<String>) -> Result<Vec<IssueInfo>, String> {
    let s = load(&app)?;
    let client = util::client(s.accept_invalid_certs)?;
    jira::lookup(&client, &s.jira_url, &need("jira_pat", "Jira")?, &keys).await
}

#[tauri::command]
async fn fetch_git(app: tauri::AppHandle, start: String, end: String) -> Result<Vec<Event>, String> {
    let s = load(&app)?;
    let (a, b) = util::range_ms(&start, &end)?;
    tauri::async_runtime::spawn_blocking(move || gitlog::fetch(&s.git_repos, &s.git_authors, a, b))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_git_repos(root: String) -> Result<Vec<gitlog::RepoInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || gitlog::scan(&root))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(serde::Deserialize)]
struct IssueUrls {
    key: String,
    urls: Vec<String>,
}

#[derive(serde::Serialize)]
struct IssuePages {
    key: String,
    pages: Vec<confluence::PageCtx>,
}

/// Confluence pages related to Jira tasks: links in the description plus the issue's web links. Context only.
#[tauri::command]
async fn fetch_issue_pages(app: tauri::AppHandle, issues: Vec<IssueUrls>) -> Result<Vec<IssuePages>, String> {
    use futures::StreamExt;
    let s = load(&app)?;
    let client = util::client(s.accept_invalid_certs)?;
    let jira_pat = need("jira_pat", "Jira")?;
    let wiki_pat = need("confluence_pat", "Confluence")?;
    let (jira_url, wiki_url) = (s.jira_url.clone(), s.confluence_url.clone());
    if wiki_url.trim().is_empty() {
        return Err("Confluence: не задан адрес".into());
    }
    let out = futures::stream::iter(issues.into_iter().take(60))
        .map(|i| {
            let (client, jira_url, wiki_url, jira_pat, wiki_pat) =
                (client.clone(), jira_url.clone(), wiki_url.clone(), jira_pat.clone(), wiki_pat.clone());
            async move {
                let mut urls = i.urls;
                urls.extend(jira::remote_links(&client, &jira_url, &jira_pat, &i.key).await);
                let pages = confluence::pages(&client, &wiki_url, &wiki_pat, &urls, 3).await;
                IssuePages { key: i.key, pages }
            }
        })
        .buffer_unordered(4)
        .collect::<Vec<_>>()
        .await;
    Ok(out.into_iter().filter(|p| !p.pages.is_empty()).collect())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct GitlabOut {
    me: String,
    events: Vec<Event>,
    /// Projects the read was limited to (empty = all projects).
    scoped: Vec<String>,
    /// Local-only mode was on, but no local repository points to this GitLab: everything was read.
    fallback: bool,
}

/// Merge requests you opened/merged/approved/commented. Limited to the projects of the selected local repositories.
#[tauri::command]
async fn fetch_gitlab(app: tauri::AppHandle, start: String, end: String) -> Result<GitlabOut, String> {
    let s = load(&app)?;
    let (a, b) = util::range_ms(&start, &end)?;
    let client = util::client(s.accept_invalid_certs)?;
    let mut scoped = if s.gitlab_local_only { gitlog::remote_paths(&s.git_repos, &s.gitlab_url) } else { vec![] };
    let fallback = s.gitlab_local_only && scoped.is_empty();
    if fallback {
        scoped = vec![];
    }
    let (me, events) = gitlab::fetch(&client, &s.gitlab_url, &need("gitlab_pat", "GitLab")?, a, b, &scoped).await?;
    Ok(GitlabOut { me, events, scoped, fallback })
}

/// Public holidays, transferred days off and shortened days for the country (read-only, public API).
#[tauri::command]
async fn fetch_holidays(app: tauri::AppHandle, country: String, start: String, end: String) -> Result<holidays::HolidayOut, String> {
    let s = load(&app)?;
    let client = util::client(s.accept_invalid_certs)?;
    holidays::fetch(&client, &country, &start, &end).await
}

#[tauri::command]
async fn fetch_confluence(app: tauri::AppHandle, start: String, end: String) -> Result<Vec<Event>, String> {
    let s = load(&app)?;
    let (a, b) = util::range_ms(&start, &end)?;
    let client = util::client(s.accept_invalid_certs)?;
    confluence::fetch(&client, &s.confluence_url, &need("confluence_pat", "Confluence")?, &start, a, b).await
}

#[tauri::command]
async fn fetch_calendar(app: tauri::AppHandle, start: String, end: String) -> Result<Vec<calendar::Meeting>, String> {
    let s = load(&app)?;
    let (a, b) = util::range_ms(&start, &end)?;
    let client = util::client(s.accept_invalid_certs)?;
    calendar::fetch(
        &client,
        &s.exchange_url,
        &s.exchange_user,
        &need("exchange_password", "Почта")?,
        a,
        b,
        s.calendar_only_calls,
    )
    .await
}

#[tauri::command]
async fn fetch_matrix(app: tauri::AppHandle, start: String, end: String) -> Result<Vec<Event>, String> {
    let s = load(&app)?;
    let (a, b) = util::range_ms(&start, &end)?;
    let client = util::client(s.accept_invalid_certs)?;
    matrix::fetch(
        &client,
        &s.matrix_homeserver,
        &need("matrix_token", "Matrix")?,
        &s.matrix_user_id,
        &s.matrix_exclude_rooms,
        a,
        b,
    )
    .await
}

/// Stores the new token and, if the user ID is not set yet, fills it in.
fn store_matrix_login(app: &tauri::AppHandle, l: matrix_sso::Login) -> Result<String, String> {
    secrets::set("matrix_token", &l.access_token)?;
    let mut s = load(app)?;
    if !l.user_id.is_empty() && s.matrix_user_id != l.user_id {
        s.matrix_user_id = l.user_id.clone();
        let json = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
        fs::write(settings_path(app)?, json).map_err(|e| e.to_string())?;
    }
    Ok(l.user_id)
}

/// Opens the browser for SSO login and waits (up to 4 minutes) for it to finish.
#[tauri::command]
async fn matrix_login_sso(app: tauri::AppHandle) -> Result<String, String> {
    let s = load(&app)?;
    let client = util::client(s.accept_invalid_certs)?;
    let login = matrix_sso::sso_login(&client, &s.matrix_homeserver).await?;
    store_matrix_login(&app, login)
}

#[tauri::command]
async fn matrix_login_password(app: tauri::AppHandle, user: String, password: String) -> Result<String, String> {
    let s = load(&app)?;
    let client = util::client(s.accept_invalid_certs)?;
    let login = matrix_sso::password_login(&client, &s.matrix_homeserver, &user, &password).await?;
    store_matrix_login(&app, login)
}

#[tauri::command]
async fn list_matrix_rooms(app: tauri::AppHandle) -> Result<Vec<matrix::Room>, String> {
    let s = load(&app)?;
    let client = util::client(s.accept_invalid_certs)?;
    matrix::list_rooms(&client, &s.matrix_homeserver, &need("matrix_token", "Matrix")?).await
}

#[tauri::command]
async fn llm_chat(app: tauri::AppHandle, system: String, user: String) -> Result<String, String> {
    let s = load(&app)?;
    let client = util::client(s.accept_invalid_certs)?;
    let key = secrets::get("llm_key");
    llm::chat(&client, &s.llm_base_url, key.as_deref(), &s.llm_model, &system, &user).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            set_secret,
            secrets_status,
            test_connection,
            fetch_jira,
            open_issue,
            lookup_issues,
            fetch_git,
            fetch_confluence,
            fetch_holidays,
            fetch_gitlab,
            fetch_issue_pages,
            fetch_calendar,
            scan_git_repos,
            fetch_matrix,
            list_matrix_rooms,
            matrix_login_sso,
            matrix_login_password,
            llm_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
