//! Local git repositories and GitLab merge requests.
use super::Ctx;
use crate::model::Event;
use crate::secrets::{self, require};
use crate::sources::{gitlab, gitlog};
use crate::util::range_ms;

#[tauri::command]
pub async fn fetch_git(app: tauri::AppHandle, start: String, end: String) -> Result<Vec<Event>, String> {
    let s = crate::settings::load(&app)?;
    let (a, b) = range_ms(&start, &end)?;
    tauri::async_runtime::spawn_blocking(move || gitlog::fetch(&s.git_repos, &s.git_authors, a, b))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn scan_git_repos(root: String) -> Result<Vec<gitlog::RepoInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || gitlog::scan(&root)).await.map_err(|e| e.to_string())?
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
pub async fn fetch_gitlab(app: tauri::AppHandle, start: String, end: String) -> Result<GitlabOut, String> {
    let c = Ctx::load(&app)?;
    let s = &c.settings;
    let (a, b) = range_ms(&start, &end)?;
    let scoped = if s.gitlab_local_only { gitlog::remote_paths(&s.git_repos, &s.gitlab_url) } else { vec![] };
    let fallback = s.gitlab_local_only && scoped.is_empty();
    let (me, events) = gitlab::fetch(&c.client, &s.gitlab_url, &require(&secrets::GITLAB)?, a, b, &scoped).await?;
    Ok(GitlabOut { me, events, scoped, fallback })
}
