//! "Check connection" buttons: one probe per service, looked up by the id the UI sends.
//! A probe reports what it found; the UI words the result.
use super::Ctx;
use crate::error::{AppError, AppResult};
use crate::secrets::{self, require};
use crate::sources::{calendar, confluence, gitlab, jira, llm, matrix};
use crate::util::truncate;
use futures::future::BoxFuture;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProbeOk {
    /// Signed in as this account.
    User { name: String },
    /// The calendar answered; meetings within ±1 day of now.
    Meetings { count: usize },
    /// The model answered.
    Reply { text: String },
}

type Probe = for<'a> fn(&'a Ctx) -> BoxFuture<'a, AppResult<ProbeOk>>;

fn user(name: String) -> ProbeOk {
    ProbeOk::User { name: if name.is_empty() { "?".into() } else { name } }
}

async fn probe_jira(c: &Ctx) -> AppResult<ProbeOk> {
    jira::test(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?).await.map(user)
}

async fn probe_calendar(c: &Ctx) -> AppResult<ProbeOk> {
    let s = &c.settings;
    let count = calendar::test(&c.client, &s.exchange_url, &s.exchange_user, &require(&secrets::EXCHANGE)?).await?;
    Ok(ProbeOk::Meetings { count })
}

async fn probe_gitlab(c: &Ctx) -> AppResult<ProbeOk> {
    gitlab::test(&c.client, &c.settings.gitlab_url, &require(&secrets::GITLAB)?).await.map(user)
}

async fn probe_confluence(c: &Ctx) -> AppResult<ProbeOk> {
    confluence::test(&c.client, &c.settings.confluence_url, &require(&secrets::CONFLUENCE)?).await.map(user)
}

async fn probe_matrix(c: &Ctx) -> AppResult<ProbeOk> {
    matrix::test(&c.client, &c.settings.matrix_homeserver, &require(&secrets::MATRIX)?).await.map(user)
}

async fn probe_llm(c: &Ctx) -> AppResult<ProbeOk> {
    let s = &c.settings;
    let key = secrets::get(secrets::LLM.name);
    let reply = llm::chat(
        &c.client,
        &s.llm_base_url,
        key.as_deref(),
        &s.llm_model,
        s.llm_rpm,
        "Reply with a JSON object.",
        "{\"ping\": true} -> reply {\"pong\": true}",
    )
    .await?;
    Ok(ProbeOk::Reply { text: truncate(&reply, 80) })
}

const PROBES: [(&str, Probe); 6] = [
    ("jira", |c| Box::pin(probe_jira(c))),
    ("calendar", |c| Box::pin(probe_calendar(c))),
    ("gitlab", |c| Box::pin(probe_gitlab(c))),
    ("confluence", |c| Box::pin(probe_confluence(c))),
    ("matrix", |c| Box::pin(probe_matrix(c))),
    ("llm", |c| Box::pin(probe_llm(c))),
];

#[tauri::command]
pub async fn test_connection(app: tauri::AppHandle, service: String) -> AppResult<ProbeOk> {
    let ctx = Ctx::load(&app)?;
    let (_, probe) = PROBES
        .iter()
        .find(|(id, _)| *id == service)
        .ok_or_else(|| AppError::new("unknownService").with("service", service.as_str()))?;
    probe(&ctx).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_probe_results_with_a_kind_tag() {
        assert_eq!(serde_json::to_string(&ProbeOk::User { name: "Ivan".into() }).unwrap(), r#"{"kind":"user","name":"Ivan"}"#);
        assert_eq!(serde_json::to_string(&ProbeOk::Meetings { count: 3 }).unwrap(), r#"{"kind":"meetings","count":3}"#);
    }
}
