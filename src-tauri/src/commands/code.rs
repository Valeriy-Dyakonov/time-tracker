//! Local git repositories and GitLab merge requests.
use super::Ctx;
use crate::model::Event;
use crate::secrets::{self, require};
use crate::sources::{gitlab, gitlog, taskgit};
use crate::util::range_ms;
use crate::texts::Lang;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub async fn fetch_git(app: tauri::AppHandle, start: String, end: String, lang: Option<String>) -> AppResult<Vec<Event>> {
    let s = crate::settings::load(&app)?;
    let (a, b) = range_ms(&start, &end)?;
    let lang = Lang::parse(lang.as_deref());
    tauri::async_runtime::spawn_blocking(move || gitlog::fetch(&s.git_repos, &s.git_authors, a, b, lang))
        .await
        .map_err(AppError::raw)?
}

/// Commits mentioning the task in the configured repositories, and its notes when that feature is on.
#[tauri::command]
pub async fn task_git(app: tauri::AppHandle, key: String) -> AppResult<taskgit::TaskGit> {
    super::atlassian::valid_key(&key)?;
    let s = crate::settings::load(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let docs = s.ai_docs_enabled.then_some(s.ai_docs_paths.as_slice());
        taskgit::find(&s.git_repos, &key, docs)
    })
    .await
    .map_err(AppError::raw)
}

/// Merge requests of the task in GitLab and the notes in their branches; `configured: false` when GitLab is not set up.
#[tauri::command]
pub async fn task_mrs(app: tauri::AppHandle, key: String) -> AppResult<gitlab::task::TaskMrs> {
    super::atlassian::valid_key(&key)?;
    let c = Ctx::load(&app)?;
    let s = &c.settings;
    let Some(pat) = secrets::get(secrets::GITLAB.name).filter(|_| !s.gitlab_url.trim().is_empty()) else {
        return Ok(gitlab::task::TaskMrs::default());
    };
    let docs = s.ai_docs_enabled.then_some(s.ai_docs_paths.as_slice());
    // A GitLab failure is shown next to what was found locally, not instead of it.
    Ok(gitlab::task::find(&c.client, &s.gitlab_url, &pat, &key, docs).await.unwrap_or_else(|e| gitlab::task::TaskMrs {
        configured: true,
        error: Some(e),
        ..Default::default()
    }))
}

/// GitLab links of a task (MRs, issues, files, wiki pages) read as context for the AI analysis; empty when
/// GitLab is not set up.
#[tauri::command]
pub async fn gitlab_links(app: tauri::AppHandle, urls: Vec<String>) -> AppResult<Vec<gitlab::links::GitLabItem>> {
    let c = Ctx::load(&app)?;
    let s = &c.settings;
    let Some(pat) = secrets::get(secrets::GITLAB.name).filter(|_| !s.gitlab_url.trim().is_empty()) else {
        return Ok(vec![]);
    };
    let urls: Vec<String> = urls.into_iter().take(40).collect();
    Ok(gitlab::links::read(&c.client, &s.gitlab_url, &pat, &urls).await)
}

/// One task note from a GitLab project branch as text.
#[tauri::command]
pub async fn task_remote_doc(app: tauri::AppHandle, project_id: u64, ref_name: String, path: String) -> AppResult<String> {
    let c = Ctx::load(&app)?;
    gitlab::task::read(&c.client, &c.settings.gitlab_url, &require(&secrets::GITLAB)?, project_id, &ref_name, &path).await
}

/// One task note as text, from a configured repository only.
#[tauri::command]
pub async fn task_doc(app: tauri::AppHandle, repo: String, commit: String, path: String) -> AppResult<String> {
    let s = crate::settings::load(&app)?;
    tauri::async_runtime::spawn_blocking(move || taskgit::read(&s.git_repos, &repo, &commit, &path)).await.map_err(AppError::raw)?
}

#[tauri::command]
pub async fn scan_git_repos(root: String) -> AppResult<Vec<gitlog::RepoInfo>> {
    tauri::async_runtime::spawn_blocking(move || gitlog::scan(&root)).await.map_err(AppError::raw)?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitlabOut {
    me: String,
    events: Vec<Event>,
    /// Projects the read was limited to; empty = all projects.
    scoped: Vec<String>,
    /// Local-only mode was on, but no local repository points to this GitLab, so everything was read.
    fallback: bool,
}

#[tauri::command]
pub async fn fetch_gitlab(app: tauri::AppHandle, start: String, end: String, lang: Option<String>) -> AppResult<GitlabOut> {
    let c = Ctx::load(&app)?;
    let s = &c.settings;
    let (a, b) = range_ms(&start, &end)?;
    let scoped = if s.gitlab_local_only { gitlog::remote_paths(&s.git_repos, &s.gitlab_url) } else { vec![] };
    let fallback = s.gitlab_local_only && scoped.is_empty();
    let (me, events) = gitlab::fetch(&c.client, &s.gitlab_url, &require(&secrets::GITLAB)?, a, b, &scoped, Lang::parse(lang.as_deref())).await?;
    Ok(GitlabOut { me, events, scoped, fallback })
}
