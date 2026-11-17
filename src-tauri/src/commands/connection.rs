//! "Check connection" buttons: one probe per service, looked up by the id the UI sends.
use super::Ctx;
use crate::secrets::{self, require};
use crate::sources::{calendar, confluence, gitlab, jira, llm, matrix};
use crate::util::truncate;
use futures::future::BoxFuture;

type Outcome = Result<String, String>;
type Probe = for<'a> fn(&'a Ctx) -> BoxFuture<'a, Outcome>;

async fn probe_jira(c: &Ctx) -> Outcome {
    jira::test(&c.client, &c.settings.jira_url, &require(&secrets::JIRA)?).await
}

async fn probe_calendar(c: &Ctx) -> Outcome {
    let s = &c.settings;
    calendar::test(&c.client, &s.exchange_url, &s.exchange_user, &require(&secrets::EXCHANGE)?).await
}

async fn probe_gitlab(c: &Ctx) -> Outcome {
    gitlab::test(&c.client, &c.settings.gitlab_url, &require(&secrets::GITLAB)?).await
}

async fn probe_confluence(c: &Ctx) -> Outcome {
    confluence::test(&c.client, &c.settings.confluence_url, &require(&secrets::CONFLUENCE)?).await
}

async fn probe_matrix(c: &Ctx) -> Outcome {
    matrix::test(&c.client, &c.settings.matrix_homeserver, &require(&secrets::MATRIX)?).await
}

async fn probe_llm(c: &Ctx) -> Outcome {
    let s = &c.settings;
    let key = secrets::get(secrets::LLM.name);
    let reply = llm::chat(
        &c.client,
        &s.llm_base_url,
        key.as_deref(),
        &s.llm_model,
        "Reply with a JSON object.",
        "{\"ping\": true} -> reply {\"pong\": true}",
    )
    .await?;
    Ok(format!("OK: {}", truncate(&reply, 80)))
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
pub async fn test_connection(app: tauri::AppHandle, service: String) -> Outcome {
    let ctx = Ctx::load(&app)?;
    let (_, probe) = PROBES.iter().find(|(id, _)| *id == service).ok_or("unknown service")?;
    probe(&ctx).await
}
