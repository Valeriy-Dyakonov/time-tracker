//! Jira Server / Data Center, REST API v2, Personal Access Token. Read-only.
mod parse;
pub mod worklog;
pub mod dashboard;
pub mod detail;

use crate::http::{Auth, JsonApi};
use crate::model::{Event, IssueInfo};
use crate::util::trim_url;
use parse::Me;
use serde::Serialize;
use serde_json::Value;
use crate::texts::Lang;
use crate::error::AppResult;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraResult {
    pub me: String,
    pub issues: Vec<IssueInfo>,
    pub events: Vec<Event>,
}

struct Jira<'a> {
    api: JsonApi<'a>,
    base: String,
}

impl<'a> Jira<'a> {
    fn new(client: &'a reqwest::Client, base: &str, pat: &'a str) -> Self {
        Self { api: JsonApi::new(client, "Jira", Auth::Bearer(pat)), base: trim_url(base) }
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> AppResult<Value> {
        self.api.get(&format!("{}{path}", self.base), query).await
    }

    async fn myself(&self) -> AppResult<Me> {
        Ok(Me::from_json(&self.get("/rest/api/2/myself", &[]).await?))
    }

    /// Id of the "Epic Link" custom field: it differs between installations.
    async fn epic_field(&self) -> Option<String> {
        let v = self.get("/rest/api/2/field", &[]).await.ok()?;
        v.as_array()?
            .iter()
            .find(|f| f["name"].as_str() == Some("Epic Link"))
            .and_then(|f| f["id"].as_str().map(String::from))
    }

    async fn search(&self, jql: String, fields: String, max: usize) -> AppResult<Value> {
        self.get(
            "/rest/api/2/search",
            &[("jql", jql), ("fields", fields), ("expand", "changelog".into()), ("maxResults", max.to_string())],
        )
        .await
    }
}

/// Display name of the token owner.
pub async fn test(client: &reqwest::Client, base: &str, pat: &str) -> AppResult<String> {
    Ok(Jira::new(client, base, pat).myself().await?.display)
}

/// Links attached in the issue's "Web links" panel (often Confluence pages).
pub async fn remote_links(client: &reqwest::Client, base: &str, pat: &str, key: &str) -> Vec<String> {
    match Jira::new(client, base, pat).get(&format!("/rest/api/2/issue/{key}/remotelink"), &[]).await {
        Ok(v) => v
            .as_array()
            .map(|a| a.iter().filter_map(|l| l["object"]["url"].as_str().map(String::from)).collect())
            .unwrap_or_default(),
        Err(_) => vec![],
    }
}

/// Every issue the user touched since `start_day` (all of them are candidates for mapping git/chat activity)
/// plus the user's own events inside the period.
pub async fn fetch(
    client: &reqwest::Client,
    base: &str,
    pat: &str,
    start_day: &str,
    start_ms: i64,
    end_ms: i64,
    lang: Lang,
) -> AppResult<JiraResult> {
    let jira = Jira::new(client, base, pat);
    let me = jira.myself().await?;
    let epic = jira.epic_field().await;
    let jql = format!(
        "updated >= \"{start_day}\" AND (assignee = currentUser() OR assignee was currentUser() \
         OR reporter = currentUser() OR worklogAuthor = currentUser() \
         OR status changed by currentUser()) ORDER BY updated DESC"
    );
    let fields = format!("{},comment,reporter", parse::issue_fields(&epic));
    const PAGE: usize = 50;

    let mut issues = vec![];
    let mut events = vec![];
    let mut start_at = 0usize;
    loop {
        let v = jira
            .get(
                "/rest/api/2/search",
                &[
                    ("jql", jql.clone()),
                    ("fields", fields.clone()),
                    ("expand", "changelog".into()),
                    ("startAt", start_at.to_string()),
                    ("maxResults", PAGE.to_string()),
                ],
            )
            .await?;
        let arr = v["issues"].as_array().cloned().unwrap_or_default();
        let total = v["total"].as_u64().unwrap_or(0) as usize;
        for it in &arr {
            events.extend(parse::my_events(it, &me, start_ms, end_ms, lang));
            let mut info = parse::issue(it, &epic);
            info.transitions = parse::transitions(it, &me);
            info.assigned_to_me = parse::assigned_to_me(it, &me);
            issues.push(info);
        }
        start_at += arr.len();
        if arr.is_empty() || start_at >= total || start_at > 2000 {
            break;
        }
    }
    Ok(JiraResult { me: me.display, issues, events })
}

/// Summaries for keys mentioned in git/chat. An unknown key (e.g. "UTF-8" in a commit message) makes
/// the whole JQL fail with 400, so a failed batch is retried key by key.
pub async fn lookup(client: &reqwest::Client, base: &str, pat: &str, keys: &[String]) -> AppResult<Vec<IssueInfo>> {
    let jira = Jira::new(client, base, pat);
    let me = jira.myself().await?;
    let epic = jira.epic_field().await;
    let fields = parse::issue_fields(&epic);
    let run = |batch: &[String]| jira.search(format!("key in ({})", batch.join(",")), fields.clone(), 50);
    let mut out = vec![];
    let mut collect = |v: Value| {
        out.extend(v["issues"].as_array().into_iter().flatten().map(|it| IssueInfo {
            assigned_to_me: parse::assigned_to_me(it, &me),
            ..parse::issue(it, &epic)
        }))
    };

    for chunk in keys.chunks(30) {
        match run(chunk).await {
            Ok(v) => collect(v),
            Err(_) if chunk.len() > 1 => {
                for k in chunk {
                    if let Ok(v) = run(std::slice::from_ref(k)).await {
                        collect(v);
                    }
                }
            }
            Err(_) => {}
        }
    }
    Ok(out)
}

/// Active users whose login, name or e-mail starts with / contains `query`.
pub async fn find_users(client: &reqwest::Client, base: &str, pat: &str, query: &str) -> AppResult<Vec<crate::model::PersonHit>> {
    let v = Jira::new(client, base, pat)
        .get("/rest/api/2/user/search", &[("username", query.to_string()), ("maxResults", "10".into())])
        .await?;
    Ok(v.as_array()
        .into_iter()
        .flatten()
        .filter(|u| u["active"].as_bool().unwrap_or(true))
        .filter_map(|u| {
            let ext_id = u["name"].as_str()?.to_string();
            Some(crate::model::PersonHit {
                name: u["displayName"].as_str().unwrap_or(&ext_id).to_string(),
                detail: u["emailAddress"].as_str().unwrap_or("").to_string(),
                ext_id,
            })
        })
        .collect())
}

/// Login and display name of the token owner.
pub async fn whoami(client: &reqwest::Client, base: &str, pat: &str) -> AppResult<(String, String)> {
    let me = Jira::new(client, base, pat).myself().await?;
    Ok((me.name, me.display))
}

/// Title, status and fix versions of the given tasks. A key that does not exist fails the whole JQL, so a
/// failed batch is retried key by key; keys Jira does not know are simply missing from the answer.
async fn versions_batch(jira: &Jira<'_>, batch: &[String]) -> AppResult<Value> {
    jira.get(
        "/rest/api/2/search",
        &[("jql", format!("key in ({})", batch.join(","))), ("fields", "summary,status,fixVersions".into()), ("maxResults", "50".into())],
    )
    .await
}

pub async fn task_versions(client: &reqwest::Client, base: &str, pat: &str, keys: &[String]) -> Vec<crate::model::MrTask> {
    let jira = Jira::new(client, base, pat);
    let read = |v: &Value| -> Vec<crate::model::MrTask> {
        v["issues"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|it| crate::model::MrTask {
                key: it["key"].as_str().unwrap_or("").to_string(),
                summary: it["fields"]["summary"].as_str().unwrap_or("").to_string(),
                status: it["fields"]["status"]["name"].as_str().unwrap_or("").to_string(),
                fix_versions: it["fields"]["fixVersions"].as_array().into_iter().flatten().filter_map(|x| x["name"].as_str().map(String::from)).collect(),
            })
            .filter(|t| !t.key.is_empty())
            .collect()
    };
    let mut out = vec![];
    for chunk in keys.chunks(30) {
        match versions_batch(&jira, chunk).await {
            Ok(v) => out.extend(read(&v)),
            Err(_) if chunk.len() > 1 => {
                for k in chunk {
                    if let Ok(v) = versions_batch(&jira, std::slice::from_ref(k)).await {
                        out.extend(read(&v));
                    }
                }
            }
            Err(_) => {}
        }
    }
    out
}
