//! GitLab (self-managed), REST API v4, Personal Access Token with `read_api`. Read-only (GET).
//! Collects what you did with merge requests: opened, merged, approved, commented (reviews).
//! MR titles and branches usually carry the Jira key, so these events map to tasks like commits do.
use crate::settings::Event;
use crate::util::{parse_jira_time, trim_url, truncate};
use chrono::DateTime;
use serde_json::Value;
use std::collections::HashMap;

async fn get_json(client: &reqwest::Client, url: &str, pat: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let resp = client
        .get(url)
        .header("PRIVATE-TOKEN", pat)
        .header("Accept", "application/json")
        .query(query)
        .send()
        .await
        .map_err(|e| format!("GitLab: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status.as_u16() == 401 {
        return Err("GitLab: 401 — токен не принят или истёк (нужны права read_api)".into());
    }
    if !status.is_success() {
        return Err(format!("GitLab HTTP {status}: {}", truncate(&text, 300)));
    }
    serde_json::from_str(&text).map_err(|e| format!("GitLab JSON: {e}"))
}

/// Several pages of a list endpoint (100 per page).
async fn get_pages(client: &reqwest::Client, url: &str, pat: &str, query: &[(&str, String)], max_pages: usize) -> Vec<Value> {
    let mut out = vec![];
    for page in 1..=max_pages {
        let mut q: Vec<(&str, String)> = query.to_vec();
        q.push(("per_page", "100".into()));
        q.push(("page", page.to_string()));
        let Ok(v) = get_json(client, url, pat, &q).await else { break };
        let arr = v.as_array().cloned().unwrap_or_default();
        let n = arr.len();
        out.extend(arr);
        if n < 100 {
            break;
        }
    }
    out
}

pub async fn test(client: &reqwest::Client, base: &str, pat: &str) -> Result<String, String> {
    let v = get_json(client, &format!("{}/api/v4/user", trim_url(base)), pat, &[]).await?;
    Ok(format!("OK: {} (@{})", v["name"].as_str().unwrap_or("?"), v["username"].as_str().unwrap_or("?")))
}

fn day(ms: i64) -> String {
    DateTime::from_timestamp_millis(ms).map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default()
}

fn in_range(ts: i64, a: i64, b: i64) -> bool {
    ts >= a && ts < b
}

/// "group/proj!12" -> "group/proj"
fn project_of(mr: &Value) -> String {
    mr["references"]["full"].as_str().and_then(|r| r.split('!').next()).unwrap_or("").to_lowercase()
}

fn allowed(scope: &[String], project: &str) -> bool {
    scope.is_empty() || scope.iter().any(|p| p.eq_ignore_ascii_case(project))
}

struct MrInfo {
    title: String,
    branch: String,
    project: String,
    desc: String,
    iid: u64,
}

fn mr_info(v: &Value) -> MrInfo {
    MrInfo {
        title: v["title"].as_str().unwrap_or("").to_string(),
        branch: v["source_branch"].as_str().unwrap_or("").to_string(),
        project: project_of(v),
        desc: truncate(v["description"].as_str().unwrap_or(""), 120),
        iid: v["iid"].as_u64().unwrap_or(0),
    }
}

fn event(ts: i64, what: &str, i: &MrInfo, extra: &str, weight: f64) -> Event {
    let proj = i.project.rsplit('/').next().unwrap_or("").to_string();
    // Branch and description go into `context`: the key search looks there when the title has none.
    let ctx = [i.branch.as_str(), i.desc.as_str()].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join(" · ");
    Event {
        to: None,
        source: "gitlab".into(),
        ts,
        issue_key: None,
        text: format!("[{proj}] {what} !{}: {}{extra}", i.iid, truncate(&i.title, 140)),
        context: if ctx.is_empty() { None } else { Some(ctx) },
        weight,
    }
}

/// Returns (my name, events). `scope` = project paths (group/project) to keep; empty = all projects.
pub async fn fetch(
    client: &reqwest::Client,
    base: &str,
    pat: &str,
    start_ms: i64,
    end_ms: i64,
    scope: &[String],
) -> Result<(String, Vec<Event>), String> {
    let base = trim_url(base);
    let api = format!("{base}/api/v4");
    let me = get_json(client, &format!("{api}/user"), pat, &[]).await?;
    let me_id = me["id"].as_u64().ok_or("GitLab: нет id пользователя")?;
    let day_ms = 86_400_000i64;
    let mut events: Vec<Event> = vec![];

    // 1) my own merge requests: opened / merged in the period
    let mine = get_pages(
        client,
        &format!("{api}/merge_requests"),
        pat,
        &[
            ("scope", "all".into()),
            ("author_id", me_id.to_string()),
            ("updated_after", format!("{}T00:00:00Z", day(start_ms - day_ms))),
        ],
        5,
    )
    .await;
    for mr in &mine {
        let i = mr_info(mr);
        if !allowed(scope, &i.project) {
            continue;
        }
        if let Some(ts) = mr["created_at"].as_str().and_then(parse_jira_time) {
            if in_range(ts, start_ms, end_ms) {
                events.push(event(ts, "Создал MR", &i, "", 1.5));
            }
        }
        if let Some(ts) = mr["merged_at"].as_str().and_then(parse_jira_time) {
            if in_range(ts, start_ms, end_ms) {
                events.push(event(ts, "MR смёржен", &i, "", 1.0));
            }
        }
    }

    // 2) my activity feed: approvals, review comments, merges done by me
    let feed = get_pages(
        client,
        &format!("{api}/users/{me_id}/events"),
        pat,
        &[("after", day(start_ms - day_ms)), ("before", day(end_ms + day_ms))],
        10,
    )
    .await;

    let mut cache: HashMap<(u64, u64), Option<MrInfo>> = HashMap::new();
    let mut lookups = 0;
    for e in &feed {
        let Some(ts) = e["created_at"].as_str().and_then(parse_jira_time) else { continue };
        if !in_range(ts, start_ms, end_ms) {
            continue;
        }
        let action = e["action_name"].as_str().unwrap_or("");
        let (what, weight) = match (action, e["target_type"].as_str().unwrap_or("")) {
            ("approved", "MergeRequest") => ("Одобрил MR (ревью)", 1.0),
            ("accepted", "MergeRequest") => ("Смёржил MR", 1.0),
            (_, "Note" | "DiffNote") if e["note"]["noteable_type"].as_str() == Some("MergeRequest") => ("Комментарий в ревью MR", 0.5),
            _ => continue,
        };
        let pid = e["project_id"].as_u64().unwrap_or(0);
        let iid = if what.starts_with("Комментарий") { e["note"]["noteable_iid"].as_u64() } else { e["target_iid"].as_u64() }.unwrap_or(0);
        if pid == 0 || iid == 0 {
            continue;
        }
        if !cache.contains_key(&(pid, iid)) {
            if lookups >= 120 {
                continue;
            }
            lookups += 1;
            let info = get_json(client, &format!("{api}/projects/{pid}/merge_requests/{iid}"), pat, &[]).await.ok().map(|v| mr_info(&v));
            cache.insert((pid, iid), info);
        }
        let Some(Some(i)) = cache.get(&(pid, iid)) else { continue };
        if !allowed(scope, &i.project) {
            continue;
        }
        let extra = if what.starts_with("Комментарий") {
            let body = truncate(e["note"]["body"].as_str().unwrap_or(""), 120);
            if body.is_empty() { String::new() } else { format!(" — «{body}»") }
        } else {
            String::new()
        };
        events.push(event(ts, what, i, &extra, weight));
    }

    events.sort_by_key(|e| e.ts);
    Ok((me["name"].as_str().unwrap_or("").to_string(), events))
}
