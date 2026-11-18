//! Jira and Confluence.
use super::Ctx;
use crate::browser;
use crate::model::{Event, IssueInfo};
use crate::secrets::{self, require};
use crate::sources::{confluence, jira};
use crate::sources::jira::worklog::{self, Worklog};
use crate::util::{range_ms, trim_url};
use futures::StreamExt;
use crate::texts::Lang;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn fetch_jira(app: tauri::AppHandle, start: String, end: String, lang: Option<String>) -> AppResult<jira::JiraResult> {
    let c = Ctx::load(&app)?;
    let (a, b) = range_ms(&start, &end)?;
    jira::fetch(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?, &start, a, b, Lang::parse(lang.as_deref())).await
}

#[tauri::command]
pub async fn lookup_issues(app: tauri::AppHandle, keys: Vec<String>) -> AppResult<Vec<IssueInfo>> {
    let c = Ctx::load(&app)?;
    jira::lookup(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?, &keys).await
}

/// "Work dashboard": open tasks for a profile ("dev", "qa", "lead") with their epics/parents;
/// with `history_days`, the tasks resolved in that many days instead.
#[tauri::command]
pub async fn jira_dashboard(app: tauri::AppHandle, profile: String, history_days: Option<u32>) -> AppResult<jira::dashboard::Dashboard> {
    let c = Ctx::load(&app)?;
    let scope = history_days.map_or(jira::dashboard::Scope::Open, jira::dashboard::Scope::History);
    jira::dashboard::load(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?, &profile, scope).await
}

/// Opens a link found in a task's description or comments in the system browser. Only http(s):
/// the text comes from Jira, so no other scheme (file:, javascript:...) is ever handed to the OS.
#[tauri::command]
pub fn open_link(url: String) -> AppResult<()> {
    if !is_web_link(&url) {
        return Err(AppError::new("openLinkInvalid").with("url", url));
    }
    browser::open(&url)
}

fn is_web_link(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    (lower.starts_with("https://") || lower.starts_with("http://")) && url.len() <= 2048 && !url.chars().any(|c| c.is_control() || c == '"' || c.is_whitespace())
}

/// One task in full for the dashboard's task view.
#[tauri::command]
pub async fn jira_issue_detail(app: tauri::AppHandle, key: String) -> AppResult<jira::detail::IssueDetail> {
    valid_key(&key)?;
    let c = Ctx::load(&app)?;
    jira::detail::load(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?, &key).await
}

/// The user's own worklogs in the period, to compare with the plan in the "Списание" tab.
#[tauri::command]
pub async fn jira_worklogs(app: tauri::AppHandle, start: String, end: String) -> AppResult<Vec<Worklog>> {
    let c = Ctx::load(&app)?;
    worklog::mine(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?, &start, &end).await
}

// The only writes to Jira: each is an explicit action of the user on one row of the "Списание" tab.

#[tauri::command]
pub async fn jira_add_worklog(app: tauri::AppHandle, key: String, date: String, seconds: i64, comment: String) -> AppResult<Worklog> {
    valid_key(&key)?;
    let c = Ctx::load(&app)?;
    worklog::add(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?, &key, &date, seconds, &comment).await
}

#[tauri::command]
pub async fn jira_update_worklog(app: tauri::AppHandle, key: String, id: String, seconds: i64, comment: String) -> AppResult<Worklog> {
    valid_key(&key)?;
    valid_id(&id)?;
    let c = Ctx::load(&app)?;
    worklog::update(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?, &key, &id, seconds, &comment).await
}

#[tauri::command]
pub async fn jira_delete_worklog(app: tauri::AppHandle, key: String, id: String) -> AppResult<()> {
    valid_key(&key)?;
    valid_id(&id)?;
    let c = Ctx::load(&app)?;
    worklog::delete(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?, &key, &id).await
}

pub(crate) fn valid_key(key: &str) -> AppResult<()> {
    if is_issue_key(key) { Ok(()) } else { Err(AppError::new("worklogBadTarget").with("key", key)) }
}

fn valid_id(id: &str) -> AppResult<()> {
    if !id.is_empty() && id.len() <= 20 && id.chars().all(|c| c.is_ascii_digit()) {
        Ok(())
    } else {
        Err(AppError::new("worklogBadTarget").with("key", id))
    }
}

fn is_issue_key(key: &str) -> bool {
    key.len() <= 40 && key.contains('-') && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Opens `<jira>/browse/<KEY>`. The key is validated and the host is always the configured Jira,
/// so the frontend cannot make the app open an arbitrary URL.
#[tauri::command]
pub fn open_issue(app: tauri::AppHandle, key: String) -> AppResult<()> {
    let s = crate::settings::load(&app)?;
    if !is_issue_key(&key) || s.jira_url.trim().is_empty() {
        return Err(AppError::new("openIssueInvalid"));
    }
    browser::open(&format!("{}/browse/{}", trim_url(&s.jira_url), key))
}

#[tauri::command]
pub async fn fetch_confluence(app: tauri::AppHandle, start: String, end: String, lang: Option<String>) -> AppResult<Vec<Event>> {
    let c = Ctx::load(&app)?;
    let (a, b) = range_ms(&start, &end)?;
    confluence::fetch(&c.client, &c.settings.confluence_url, &require(&secrets::CONFLUENCE)?, &start, a, b, Lang::parse(lang.as_deref())).await
}

#[derive(serde::Deserialize)]
pub struct IssueUrls {
    key: String,
    urls: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct IssuePages {
    key: String,
    pages: Vec<confluence::PageCtx>,
}

/// Confluence pages related to tasks: links in the description plus the issue's web links. Context only.
#[tauri::command]
pub async fn fetch_issue_pages(app: tauri::AppHandle, issues: Vec<IssueUrls>) -> AppResult<Vec<IssuePages>> {
    let c = Ctx::load(&app)?;
    let jira_pat = require(&secrets::JIRA)?;
    let wiki_pat = require(&secrets::CONFLUENCE)?;
    let (jira_url, wiki_url) = (&c.settings.jira_url, &c.settings.confluence_url);
    if wiki_url.trim().is_empty() {
        return Err(AppError::new("urlMissing").with("service", "Confluence"));
    }
    let out = futures::stream::iter(issues.into_iter().take(60))
        .map(|i| {
            let (c, jira_pat, wiki_pat) = (&c, &jira_pat, &wiki_pat);
            async move {
                let mut urls = i.urls;
                urls.extend(jira::remote_links(&c.client, jira_url, jira_pat, &i.key).await);
                let pages = confluence::pages(&c.client, wiki_url, wiki_pat, &urls, 3).await;
                IssuePages { key: i.key, pages }
            }
        })
        .buffer_unordered(4)
        .collect::<Vec<_>>()
        .await;
    Ok(out.into_iter().filter(|p| !p.pages.is_empty()).collect())
}

#[cfg(test)]
mod tests {
    use super::is_issue_key;

    #[test]
    fn accepts_only_issue_like_keys() {
        assert!(is_issue_key("ABC-123"));
        assert!(!is_issue_key("ABC"));
        assert!(!is_issue_key("A-1/../../x"));
        assert!(!is_issue_key("A-1?x=https://evil"));
    }

    #[test]
    fn opens_only_web_links() {
        assert!(super::is_web_link("https://wiki.company.ru/x?pageId=1"));
        assert!(!super::is_web_link("file:///C:/Windows/system32/calc.exe"));
        assert!(!super::is_web_link("javascript:alert(1)"));
        assert!(!super::is_web_link("https://a b"));
    }
}
