//! Jira Server / Data Center, REST API v2, Personal Access Token. Read-only (GET).
use crate::settings::{Event, IssueInfo, StatusChange};
use crate::util::{parse_jira_time, trim_url, truncate};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraResult {
    pub me: String,
    pub issues: Vec<IssueInfo>,
    pub events: Vec<Event>,
}

struct Me {
    name: String,
    key: String,
    display: String,
}

async fn get_json(
    client: &reqwest::Client,
    url: &str,
    pat: &str,
    query: &[(&str, String)],
) -> Result<Value, String> {
    let resp = client
        .get(url)
        .bearer_auth(pat)
        .header("Accept", "application/json")
        .query(query)
        .send()
        .await
        .map_err(|e| format!("Jira: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Jira HTTP {status}: {}", truncate(&text, 300)));
    }
    serde_json::from_str(&text).map_err(|e| format!("Jira JSON: {e}"))
}

async fn myself(client: &reqwest::Client, base: &str, pat: &str) -> Result<Me, String> {
    let v = get_json(client, &format!("{base}/rest/api/2/myself"), pat, &[]).await?;
    let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
    Ok(Me { name: s("name"), key: s("key"), display: s("displayName") })
}

/// Id of the "Epic Link" custom field (differs between Jira installations).
async fn epic_field(client: &reqwest::Client, base: &str, pat: &str) -> Option<String> {
    let v = get_json(client, &format!("{base}/rest/api/2/field"), pat, &[]).await.ok()?;
    v.as_array()?
        .iter()
        .find(|f| f["name"].as_str() == Some("Epic Link"))
        .and_then(|f| f["id"].as_str().map(String::from))
}

fn issue_fields(epic: &Option<String>) -> String {
    let mut f = String::from("summary,status,issuetype,description,parent,issuelinks,created,resolutiondate");
    if let Some(e) = epic {
        f.push(',');
        f.push_str(e);
    }
    f
}

/// http(s) links from a Jira description (wiki markup `[title|url]`, plain URLs).
fn extract_urls(text: &str) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for part in text.split(|c: char| c.is_whitespace() || "[]|()<>\"'".contains(c)) {
        if part.starts_with("http://") || part.starts_with("https://") {
            let u = part.trim_end_matches(|c: char| ".,;!?".contains(c)).to_string();
            if !out.contains(&u) {
                out.push(u);
            }
        }
    }
    out.truncate(10);
    out
}

/// Web links attached to an issue ("Web links" / Confluence pages in the issue panel).
pub async fn remote_links(client: &reqwest::Client, base: &str, pat: &str, key: &str) -> Vec<String> {
    let url = format!("{}/rest/api/2/issue/{}/remotelink", trim_url(base), key);
    match get_json(client, &url, pat, &[]).await {
        Ok(v) => v
            .as_array()
            .map(|a| a.iter().filter_map(|l| l["object"]["url"].as_str().map(String::from)).collect())
            .unwrap_or_default(),
        Err(_) => vec![],
    }
}

/// Common issue data: summary, status, type, and the context around the task (parent, epic, links, dates).
fn parse_issue(it: &Value, epic: &Option<String>) -> IssueInfo {
    let f = &it["fields"];
    let mut links = vec![];
    for l in f["issuelinks"].as_array().cloned().unwrap_or_default() {
        for side in ["outwardIssue", "inwardIssue"] {
            if let Some(k) = l[side]["key"].as_str() {
                links.push(k.to_string());
            }
        }
    }
    IssueInfo {
        key: it["key"].as_str().unwrap_or("").to_string(),
        summary: f["summary"].as_str().unwrap_or("").to_string(),
        status: f["status"]["name"].as_str().unwrap_or("").to_string(),
        issue_type: f["issuetype"]["name"].as_str().unwrap_or("").to_string(),
        description: truncate(f["description"].as_str().unwrap_or(""), 500),
        urls: extract_urls(f["description"].as_str().unwrap_or("")),
        parent: f["parent"]["key"].as_str().map(String::from),
        epic: epic.as_ref().and_then(|e| f[e.as_str()].as_str()).map(String::from),
        links,
        transitions: vec![],
        created: f["created"].as_str().and_then(parse_jira_time),
        resolved: f["resolutiondate"].as_str().and_then(parse_jira_time),
    }
}

pub async fn test(client: &reqwest::Client, base: &str, pat: &str) -> Result<String, String> {
    let me = myself(client, &trim_url(base), pat).await?;
    Ok(format!("OK: {}", me.display))
}

fn is_me(author: &Value, me: &Me) -> bool {
    let name = author["name"].as_str().unwrap_or("");
    let key = author["key"].as_str().unwrap_or("");
    (!me.name.is_empty() && name == me.name) || (!me.key.is_empty() && key == me.key)
}

pub async fn fetch(
    client: &reqwest::Client,
    base: &str,
    pat: &str,
    start_day: &str,
    start_ms: i64,
    end_ms: i64,
) -> Result<JiraResult, String> {
    let base = trim_url(base);
    let me = myself(client, &base, pat).await?;
    let epic = epic_field(client, &base, pat).await;

    let jql = format!(
        "updated >= \"{start_day}\" AND (assignee = currentUser() OR assignee was currentUser() \
         OR reporter = currentUser() OR worklogAuthor = currentUser() \
         OR status changed by currentUser()) ORDER BY updated DESC"
    );

    let mut issues = vec![];
    let mut events = vec![];
    let mut start_at = 0usize;
    let page = 50usize;

    loop {
        let v = get_json(
            client,
            &format!("{base}/rest/api/2/search"),
            pat,
            &[
                ("jql", jql.clone()),
                ("fields", format!("{},comment,reporter", issue_fields(&epic))),
                ("expand", "changelog".into()),
                ("startAt", start_at.to_string()),
                ("maxResults", page.to_string()),
            ],
        )
        .await?;

        let arr = v["issues"].as_array().cloned().unwrap_or_default();
        let total = v["total"].as_u64().unwrap_or(0) as usize;

        for it in &arr {
            let key = it["key"].as_str().unwrap_or("").to_string();
            let f = &it["fields"];
            let summary = f["summary"].as_str().unwrap_or("").to_string();

            let mut touched = false;

            // created by me
            if is_me(&f["reporter"], &me) {
                if let Some(ts) = f["created"].as_str().and_then(parse_jira_time) {
                    if ts >= start_ms && ts < end_ms {
                        touched = true;
                        events.push(Event {
                            source: "jira".into(),
                            ts,
                            issue_key: Some(key.clone()),
                            text: format!("Создал задачу: {}", truncate(&summary, 120)),
                            context: None,
                            weight: 1.0,
                        });
                    }
                }
            }

            // my changes (status transitions, assignee, resolution, ...)
            if let Some(hs) = it["changelog"]["histories"].as_array() {
                for h in hs {
                    if !is_me(&h["author"], &me) {
                        continue;
                    }
                    let Some(ts) = h["created"].as_str().and_then(parse_jira_time) else { continue };
                    if ts < start_ms || ts >= end_ms {
                        continue;
                    }
                    let items: Vec<String> = h["items"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .map(|i| {
                                    format!(
                                        "{}: {} → {}",
                                        i["field"].as_str().unwrap_or("?"),
                                        i["fromString"].as_str().unwrap_or("∅"),
                                        truncate(i["toString"].as_str().unwrap_or("∅"), 60)
                                    )
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if items.is_empty() {
                        continue;
                    }
                    touched = true;
                    events.push(Event {
                        source: "jira".into(),
                        ts,
                        issue_key: Some(key.clone()),
                        text: items.join("; "),
                        context: None,
                        weight: 1.0,
                    });
                }
            }

            // my comments
            if let Some(cs) = f["comment"]["comments"].as_array() {
                for c in cs {
                    if !is_me(&c["author"], &me) {
                        continue;
                    }
                    let Some(ts) = c["created"].as_str().and_then(parse_jira_time) else { continue };
                    if ts < start_ms || ts >= end_ms {
                        continue;
                    }
                    touched = true;
                    events.push(Event {
                        source: "jira".into(),
                        ts,
                        issue_key: Some(key.clone()),
                        text: format!("Комментарий: {}", truncate(c["body"].as_str().unwrap_or(""), 300)),
                        context: None,
                        weight: 1.0,
                    });
                }
            }

            // Keep every issue we saw: it is a candidate for mapping git/chat activity.
            let mut info = parse_issue(it, &epic);
            // Full status history, whoever made the change: needed to tell "in development" from "in testing".
            for h in it["changelog"]["histories"].as_array().cloned().unwrap_or_default() {
                let Some(ts) = h["created"].as_str().and_then(parse_jira_time) else { continue };
                for i in h["items"].as_array().cloned().unwrap_or_default() {
                    if i["field"].as_str() == Some("status") {
                        info.transitions.push(StatusChange {
                            ts,
                            from: i["fromString"].as_str().unwrap_or("").to_string(),
                            to: i["toString"].as_str().unwrap_or("").to_string(),
                            by_me: is_me(&h["author"], &me),
                        });
                    }
                }
            }
            info.transitions.sort_by_key(|t| t.ts);
            issues.push(info);
            let _ = touched;
        }

        start_at += arr.len();
        if arr.is_empty() || start_at >= total || start_at > 2000 {
            break;
        }
    }

    Ok(JiraResult { me: me.display, issues, events })
}

/// Look up summaries for issue keys mentioned in git/chat that are not in `known`.
/// Unknown keys (e.g. "UTF-8" in a commit message) make a whole JQL fail with 400,
/// so a failed batch is retried key by key.
pub async fn lookup(
    client: &reqwest::Client,
    base: &str,
    pat: &str,
    keys: &[String],
) -> Result<Vec<IssueInfo>, String> {
    let base = trim_url(base);
    let url = format!("{base}/rest/api/2/search");
    let epic = epic_field(client, &base, pat).await;
    let fields = issue_fields(&epic);
    let mut out = vec![];

    let run = |batch: Vec<String>| {
        let url = url.clone();
        let fields = fields.clone();
        async move {
            let jql = format!("key in ({})", batch.join(","));
            get_json(
                client,
                &url,
                pat,
                &[
                    ("jql", jql),
                    ("fields", fields),
                    ("maxResults", "50".into()),
                ],
            )
            .await
        }
    };

    let parse = |v: Value, out: &mut Vec<IssueInfo>| {
        for it in v["issues"].as_array().cloned().unwrap_or_default() {
            out.push(parse_issue(&it, &epic));
        }
    };

    for chunk in keys.chunks(30) {
        match run(chunk.to_vec()).await {
            Ok(v) => parse(v, &mut out),
            Err(_) if chunk.len() > 1 => {
                for k in chunk {
                    if let Ok(v) = run(vec![k.clone()]).await {
                        parse(v, &mut out);
                    }
                }
            }
            Err(_) => {}
        }
    }
    Ok(out)
}
