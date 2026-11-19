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
pub async fn task_mrs(
    app: tauri::AppHandle,
    store: tauri::State<'_, crate::store::Store>,
    key: String,
    force: Option<bool>,
) -> AppResult<gitlab::task::TaskMrs> {
    use crate::store::{self, fresh, task_mrs};
    super::atlassian::valid_key(&key)?;
    let c = Ctx::load(&app)?;
    let s = &c.settings;
    let Some(pat) = secrets::get(secrets::GITLAB.name).filter(|_| !s.gitlab_url.trim().is_empty()) else {
        return Ok(gitlab::task::TaskMrs::default());
    };
    let docs = s.ai_docs_enabled.then_some(s.ai_docs_paths.as_slice());
    // The notes in branches depend on a setting, so the stored answer belongs to the setting it was read with.
    let scope = format!("gitlab.task.{key}.{}", if docs.is_some() { "notes" } else { "mrs" });
    store.with(|conn| fresh::bind_origin(conn, "gitlab", s.gitlab_url.trim()))?;
    if !force.unwrap_or(false) && store.with(|conn| fresh::is_fresh(conn, &scope, fresh::TASK_MRS_TTL))? {
        if let Some(stored) = store.with(|conn| task_mrs::load(conn, &scope, &key))? {
            return Ok(stored);
        }
    }
    // A GitLab failure is shown next to what was found locally, not instead of it, and is not stored.
    match gitlab::task::find(&c.client, &s.gitlab_url, &pat, &key, docs).await {
        Ok(found) => {
            // The answer is in hand; a failed write only means the next open asks GitLab again.
            let _ = store.with(|conn| task_mrs::save(conn, &scope, &key, &found, store::now_ms()));
            Ok(found)
        }
        Err(e) => Ok(gitlab::task::TaskMrs { configured: true, error: Some(e), ..Default::default() }),
    }
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

/// Usernames come from the roster file the user typed; GitLab logins are letters, digits and `._-`.
fn clean_usernames(list: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = list
        .into_iter()
        .map(|u| u.trim().to_string())
        .filter(|u| !u.is_empty() && u.len() <= 100 && u.chars().all(|c| c.is_alphanumeric() || "._-".contains(c)))
        .collect();
    out.sort();
    out.dedup();
    out.truncate(80);
    out
}

/// Open merge requests that wait for the user, the user's own and those of `team` (GitLab usernames).
/// Served from the local store while fresh; `force` (Refresh) and old lists ask GitLab again, reading
/// approvals only for MRs that changed.
#[tauri::command]
pub async fn gitlab_mr_board(
    app: tauri::AppHandle,
    store: tauri::State<'_, crate::store::Store>,
    team: Vec<String>,
    force: Option<bool>,
) -> AppResult<gitlab::board::MrBoard> {
    use crate::store::{self, fresh, mrs};
    let c = Ctx::load(&app)?;
    let s = &c.settings;
    let team = clean_usernames(team);
    let pat = require(&secrets::GITLAB)?;
    if s.gitlab_url.trim().is_empty() {
        return Err(AppError::new("urlMissing").with("service", "GitLab"));
    }
    // The list depends on whose MRs are asked for.
    let scope = {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        team.hash(&mut h);
        format!("gitlab.mr.board.{:x}", h.finish())
    };
    store.with(|conn| fresh::bind_origin(conn, "gitlab", s.gitlab_url.trim()))?;
    if !force.unwrap_or(false) && store.with(|conn| fresh::is_fresh(conn, &scope, fresh::MR_TTL))? {
        if let Some(b) = store.with(|conn| mrs::load_board(conn, &scope))? {
            let mut b = b;
            add_tasks(&c, &store, &mut b, false).await;
            return Ok(b);
        }
    }
    let known = store.with(|conn| mrs::known(conn)).unwrap_or_default();
    let (me, list) = gitlab::board::load(&c.client, &s.gitlab_url, &pat, &team, &known).await?;
    let mut board = gitlab::board::MrBoard { me, mrs: list, cached_at: store::now_ms(), tasks: vec![] };
    // The answer is in hand; a failed write only means the next open asks GitLab again.
    let _ = store.with(|conn| mrs::save_board(conn, &scope, &board, board.cached_at));
    add_tasks(&c, &store, &mut board, force.unwrap_or(false)).await;
    Ok(board)
}

/// Fills in the Jira tasks the MRs are about (title, status, release). Optional: without Jira, or when it
/// does not answer, the board simply has no tasks. Tasks are read again when a day old or on Refresh.
async fn add_tasks(c: &Ctx, store: &crate::store::Store, board: &mut gitlab::board::MrBoard, force: bool) {
    use crate::store::{self, mrs};
    const TASK_TTL_MS: i64 = 24 * 60 * 60 * 1000;
    let mut keys: Vec<String> = board.mrs.iter().filter_map(|m| m.task.clone()).collect();
    keys.sort();
    keys.dedup();
    let Some(pat) = secrets::get(secrets::JIRA.name).filter(|_| !c.settings.jira_url.trim().is_empty()) else { return };
    if keys.is_empty() {
        return;
    }
    let now = store::now_ms();
    let stale = if force { keys.clone() } else { store.with(|conn| mrs::stale_tasks(conn, &keys, TASK_TTL_MS, now)).unwrap_or_else(|_| keys.clone()) };
    if !stale.is_empty() {
        let asked = tokio::time::timeout(std::time::Duration::from_secs(20), crate::sources::jira::task_versions(&c.client, &c.settings.jira_url, &pat, &stale)).await;
        if let Ok(found) = asked {
            let _ = store.with(|conn| mrs::save_tasks(conn, &stale, &found, now));
        }
    }
    board.tasks = store.with(|conn| mrs::load_tasks(conn, &keys)).unwrap_or_default();
}
