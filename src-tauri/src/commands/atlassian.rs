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

/// "Work dashboard": the user's open tasks and the ones resolved recently.
#[tauri::command]
pub async fn jira_my_issues(app: tauri::AppHandle) -> AppResult<Vec<jira::dashboard::DashIssue>> {
    let c = Ctx::load(&app)?;
    jira::dashboard::my_issues(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?).await
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

fn valid_key(key: &str) -> AppResult<()> {
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
}
