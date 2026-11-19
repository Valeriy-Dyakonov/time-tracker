//! GitLab (self-managed), REST API v4, Personal Access Token with `read_api`. Read-only.
//! What the user did with merge requests: opened, merged, approved, commented in review.
//! MR titles and branches usually carry the Jira key, so these events map to tasks like commits do.
use crate::http::{Auth, JsonApi};
use crate::model::Event;
use crate::util::{parse_jira_time, trim_url, truncate};
use chrono::DateTime;
use serde_json::Value;
use std::collections::HashMap;
use crate::texts::Lang;
use crate::error::{AppError, AppResult};

pub mod board;
pub mod links;
pub mod task;

const DAY_MS: i64 = 86_400_000;
const MAX_MR_LOOKUPS: usize = 120;

struct GitLab<'a> {
    api: JsonApi<'a>,
    root: String,
}

impl<'a> GitLab<'a> {
    fn new(client: &'a reqwest::Client, base: &str, pat: &'a str) -> Self {
        let api = JsonApi::new(client, "GitLab", Auth::Header("PRIVATE-TOKEN", pat))
            .on_unauthorized("gitlabUnauthorized");
        Self { api, root: format!("{}/api/v4", trim_url(base)) }
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> AppResult<Value> {
        self.api.get(&format!("{}{path}", self.root), query).await
    }

    async fn get_text(&self, path: &str, query: &[(&str, String)]) -> AppResult<String> {
        self.api.get_text(&format!("{}{path}", self.root), query).await
    }

    /// Several pages of a list endpoint, 100 items each; a failed page ends the list.
    async fn get_pages(&self, path: &str, query: &[(&str, String)], max_pages: usize) -> Vec<Value> {
        let mut out = vec![];
        for page in 1..=max_pages {
            let mut q = query.to_vec();
            q.push(("per_page", "100".into()));
            q.push(("page", page.to_string()));
            let Ok(v) = self.get(path, &q).await else { break };
            let arr = v.as_array().cloned().unwrap_or_default();
            let n = arr.len();
            out.extend(arr);
            if n < 100 {
                break;
            }
        }
        out
    }
}

/// "Name (@username)" of the token owner.
pub async fn test(client: &reqwest::Client, base: &str, pat: &str) -> AppResult<String> {
    let v = GitLab::new(client, base, pat).get("/user", &[]).await?;
    Ok(format!("{} (@{})", v["name"].as_str().unwrap_or("?"), v["username"].as_str().unwrap_or("?")))
}

fn day(ms: i64) -> String {
    DateTime::from_timestamp_millis(ms).map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default()
}

/// Project paths to keep; empty = all projects.
struct Scope<'a>(&'a [String]);

impl Scope<'_> {
    fn allows(&self, project: &str) -> bool {
        self.0.is_empty() || self.0.iter().any(|p| p.eq_ignore_ascii_case(project))
    }
}

struct MrInfo {
    title: String,
    branch: String,
    project: String,
    desc: String,
    iid: u64,
}

impl MrInfo {
    fn from_json(v: &Value) -> Self {
        Self {
            title: v["title"].as_str().unwrap_or("").to_string(),
            branch: v["source_branch"].as_str().unwrap_or("").to_string(),
            // "group/proj!12" -> "group/proj"
            project: v["references"]["full"].as_str().and_then(|r| r.split('!').next()).unwrap_or("").to_lowercase(),
            desc: truncate(v["description"].as_str().unwrap_or(""), 120),
            iid: v["iid"].as_u64().unwrap_or(0),
        }
    }

    fn event(&self, ts: i64, kind: &str, what: &str, extra: &str, weight: f64) -> Event {
        let proj = self.project.rsplit('/').next().unwrap_or("");
        // The key search also looks into `context` when the title has no key.
        let ctx = [self.branch.as_str(), self.desc.as_str()].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" · ");
        Event {
            context: (!ctx.is_empty()).then_some(ctx),
            weight,
            kind: Some(kind.into()),
            ..Event::new("gitlab", ts, format!("[{proj}] {what} !{}: {}{extra}", self.iid, truncate(&self.title, 140)))
        }
    }
}

/// Activity-feed entry -> (description, weight, MR iid, is a review note), or None when it is not about a merge request.
fn feed_action(e: &Value, lang: Lang) -> Option<(&'static str, &'static str, f64, u64, bool)> {
    let target = e["target_type"].as_str().unwrap_or("");
    let on_mr_note = matches!(target, "Note" | "DiffNote") && e["note"]["noteable_type"].as_str() == Some("MergeRequest");
    let (kind, what, weight, iid) = match (e["action_name"].as_str().unwrap_or(""), target) {
        ("approved", "MergeRequest") => ("mr_approved", lang.mr_approved(), 1.0, e["target_iid"].as_u64()),
        ("accepted", "MergeRequest") => ("mr_merged_by_me", lang.mr_accepted(), 1.0, e["target_iid"].as_u64()),
        _ if on_mr_note => ("mr_comment", lang.mr_review_note(), 0.5, e["note"]["noteable_iid"].as_u64()),
        _ => return None,
    };
    Some((kind, what, weight, iid.unwrap_or(0), on_mr_note))
}

/// Returns (my name, events).
pub async fn fetch(
    client: &reqwest::Client,
    base: &str,
    pat: &str,
    start_ms: i64,
    end_ms: i64,
    scope: &[String],
    lang: Lang,
) -> AppResult<(String, Vec<Event>)> {
    let gl = GitLab::new(client, base, pat);
    let scope = Scope(scope);
    let in_range = |ts: i64| ts >= start_ms && ts < end_ms;
    let me = gl.get("/user", &[]).await?;
    let me_id = me["id"].as_u64().ok_or_else(|| AppError::service("GitLab", "no user id"))?;
    let mut events: Vec<Event> = vec![];

    let mine = gl
        .get_pages(
            "/merge_requests",
            &[
                ("scope", "all".into()),
                ("author_id", me_id.to_string()),
                ("updated_after", format!("{}T00:00:00Z", day(start_ms - DAY_MS))),
            ],
            5,
        )
        .await;
    for mr in &mine {
        let i = MrInfo::from_json(mr);
        if !scope.allows(&i.project) {
            continue;
        }
        let at = |field: &str| mr[field].as_str().and_then(parse_jira_time).filter(|t| in_range(*t));
        if let Some(ts) = at("created_at") {
            events.push(i.event(ts, "mr_opened", lang.mr_opened(), "", 1.5));
        }
        if let Some(ts) = at("merged_at") {
            events.push(i.event(ts, "mr_merged", lang.mr_merged(), "", 1.0));
        }
    }

    let feed = gl
        .get_pages(
            &format!("/users/{me_id}/events"),
            &[("after", day(start_ms - DAY_MS)), ("before", day(end_ms + DAY_MS))],
            10,
        )
        .await;
    let mut cache: HashMap<(u64, u64), Option<MrInfo>> = HashMap::new();
    for e in &feed {
        let Some(ts) = e["created_at"].as_str().and_then(parse_jira_time).filter(|t| in_range(*t)) else { continue };
        let Some((kind, what, weight, iid, is_note)) = feed_action(e, lang) else { continue };
        let pid = e["project_id"].as_u64().unwrap_or(0);
        if pid == 0 || iid == 0 {
            continue;
        }
        if !cache.contains_key(&(pid, iid)) {
            if cache.len() >= MAX_MR_LOOKUPS {
                continue;
            }
            let info = gl.get(&format!("/projects/{pid}/merge_requests/{iid}"), &[]).await.ok().map(|v| MrInfo::from_json(&v));
            cache.insert((pid, iid), info);
        }
        let Some(Some(i)) = cache.get(&(pid, iid)) else { continue };
        if !scope.allows(&i.project) {
            continue;
        }
        let body = truncate(e["note"]["body"].as_str().unwrap_or(""), 120);
        let extra = if is_note && !body.is_empty() { format!(" — «{body}»") } else { String::new() };
        events.push(i.event(ts, kind, what, &extra, weight));
    }

    events.sort_by_key(|e| e.ts);
    Ok((me["name"].as_str().unwrap_or("").to_string(), events))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_feed_entries_to_review_actions() {
        let approved = json!({ "action_name": "approved", "target_type": "MergeRequest", "target_iid": 7 });
        assert_eq!(feed_action(&approved, Lang::Ru), Some(("mr_approved", "Одобрил MR (ревью)", 1.0, 7, false)));
        let note = json!({ "action_name": "commented on", "target_type": "DiffNote", "note": { "noteable_type": "MergeRequest", "noteable_iid": 3 } });
        assert_eq!(feed_action(&note, Lang::En), Some(("mr_comment", "Review comment on MR", 0.5, 3, true)));
        let issue_note = json!({ "action_name": "commented on", "target_type": "Note", "note": { "noteable_type": "Issue", "noteable_iid": 3 } });
        assert_eq!(feed_action(&issue_note, Lang::Ru), None);
    }

    #[test]
    fn empty_scope_allows_everything() {
        assert!(Scope(&[]).allows("a/b"));
        assert!(Scope(&["A/B".into()]).allows("a/b"));
        assert!(!Scope(&["x/y".into()]).allows("a/b"));
    }
}

/// Active users matching `query` (name, username or e-mail).
pub async fn find_users(client: &reqwest::Client, base: &str, pat: &str, query: &str) -> AppResult<Vec<crate::model::PersonHit>> {
    let v = GitLab::new(client, base, pat)
        .get("/users", &[("search", query.to_string()), ("active", "true".into()), ("per_page", "10".into())])
        .await?;
    Ok(v.as_array()
        .into_iter()
        .flatten()
        .filter_map(|u| {
            let ext_id = u["username"].as_str()?.to_string();
            Some(crate::model::PersonHit {
                name: u["name"].as_str().unwrap_or(&ext_id).to_string(),
                detail: u["public_email"].as_str().unwrap_or("").to_string(),
                ext_id,
            })
        })
        .collect())
}

/// Username and name of the token owner.
pub async fn whoami(client: &reqwest::Client, base: &str, pat: &str) -> AppResult<(String, String)> {
    let v = GitLab::new(client, base, pat).get("/user", &[]).await?;
    Ok((v["username"].as_str().unwrap_or("").to_string(), v["name"].as_str().unwrap_or("").to_string()))
}
