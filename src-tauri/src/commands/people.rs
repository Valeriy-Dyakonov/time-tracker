use super::Ctx;
use crate::error::{AppError, AppResult};
use crate::model::PersonHit;
use crate::secrets::{self, require};
use crate::sources::{gitlab, jira, matrix};

async fn find(c: &Ctx, system: &str, query: &str) -> AppResult<Vec<PersonHit>> {
    let s = &c.settings;
    match system {
        "jira" => jira::find_users(&c.client, &s.jira_url, &require(&secrets::JIRA)?, query).await,
        "gitlab" => gitlab::find_users(&c.client, &s.gitlab_url, &require(&secrets::GITLAB)?, query).await,
        "matrix" => matrix::find_users(&c.client, &s.matrix_homeserver, &require(&secrets::MATRIX)?, query).await,
        _ => Err(AppError::new("unknownService").with("service", system.to_string())),
    }
}

/// The servers match the whole phrase against one field ("Ivan Petrov" finds nothing if the name is stored
/// "Petrov Ivan"), so a phrase with no hits is retried word by word and the results are merged.
async fn find_flexible(c: &Ctx, system: &str, query: &str) -> AppResult<Vec<PersonHit>> {
    let hits = find(c, system, query).await?;
    if !hits.is_empty() {
        return Ok(hits);
    }
    let mut out: Vec<PersonHit> = Vec::new();
    for word in query.split_whitespace().filter(|w| w.chars().count() >= 2) {
        for h in find(c, system, word).await? {
            if !out.iter().any(|o| o.ext_id == h.ext_id) {
                out.push(h);
            }
        }
    }
    out.truncate(10);
    Ok(out)
}

/// Looks a person up by name in one system, for attaching an account in the team roster.
#[tauri::command]
pub async fn search_people(app: tauri::AppHandle, system: String, query: String) -> AppResult<Vec<PersonHit>> {
    let query = query.trim().to_string();
    if query.chars().count() < 2 {
        return Ok(vec![]);
    }
    let c = Ctx::load(&app)?;
    // A server that does not answer must not keep the search spinning for the whole HTTP timeout.
    tokio::time::timeout(std::time::Duration::from_secs(12), find_flexible(&c, &system, &query))
        .await
        .unwrap_or_else(|_| Err(AppError::new("searchTimeout").with("service", system.clone())))
}

/// The user's own accounts, known from the connections already set up: no search needed for them.
#[tauri::command]
pub async fn my_accounts(app: tauri::AppHandle) -> AppResult<Vec<MyAccount>> {
    let c = Ctx::load(&app)?;
    let s = &c.settings;
    let mut out = Vec::new();
    let timeout = |secs| std::time::Duration::from_secs(secs);
    if let Some(pat) = secrets::get(secrets::JIRA.name).filter(|_| !s.jira_url.trim().is_empty()) {
        if let Ok(Ok((login, name))) = tokio::time::timeout(timeout(10), jira::whoami(&c.client, &s.jira_url, &pat)).await {
            out.push(MyAccount { system: "jira", ext_id: login, name });
        }
    }
    if let Some(pat) = secrets::get(secrets::GITLAB.name).filter(|_| !s.gitlab_url.trim().is_empty()) {
        if let Ok(Ok((login, name))) = tokio::time::timeout(timeout(10), gitlab::whoami(&c.client, &s.gitlab_url, &pat)).await {
            out.push(MyAccount { system: "gitlab", ext_id: login, name });
        }
    }
    if !s.matrix_user_id.trim().is_empty() {
        out.push(MyAccount { system: "matrix", ext_id: s.matrix_user_id.trim().to_string(), name: String::new() });
    }
    out.retain(|a| !a.ext_id.is_empty());
    Ok(out)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyAccount {
    pub system: &'static str,
    pub ext_id: String,
    pub name: String,
}
