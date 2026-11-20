//! The MR board: open merge requests that need the user (asked to review), the user's own, and those of
//! the team. The list calls are cheap; approvals are one call per MR, so they are only read again for MRs
//! that changed since the last time (GitLab's `updated_at`).
use super::GitLab;
use crate::error::AppResult;
use chrono::DateTime;
use futures::stream::{self, StreamExt};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

const MAX_PAGES: usize = 3;
const MAX_MRS: usize = 300;
const PARALLEL: usize = 6;
/// Pipelines are one call per MR: only the most recently changed ones are read.
const MAX_PIPELINES: usize = 150;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MrPerson {
    pub username: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mr {
    pub project_id: i64,
    pub iid: i64,
    pub project: String,
    pub title: String,
    pub url: String,
    pub source_branch: String,
    pub target_branch: String,
    /// Jira key found in the title or the branch.
    pub task: Option<String>,
    pub author: MrPerson,
    pub draft: bool,
    pub conflicts: bool,
    /// No unresolved discussion threads.
    pub discussions_resolved: bool,
    /// GitLab's `detailed_merge_status` (`mergeable`, `not_approved`, `ci_must_pass`...).
    pub merge_status: String,
    pub comments: i64,
    pub created: i64,
    pub updated: i64,
    pub reviewers: Vec<MrPerson>,
    pub approved_by: Vec<MrPerson>,
    /// Approvals still missing; `None` when GitLab does not say (no rules) or they were not loaded.
    pub approvals_left: Option<i64>,
    /// Approvals were read for this version of the MR.
    pub detailed: bool,
    /// Status of the latest pipeline (`success`, `failed`, `running`...); `None` when there is none or it was not read.
    pub pipeline: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MrBoard {
    pub me: MrPerson,
    pub mrs: Vec<Mr>,
    pub cached_at: i64,
    /// The Jira tasks the MRs are about (empty when Jira is not set up).
    pub tasks: Vec<crate::model::MrTask>,
}

/// What the store already knows about an MR's approvals.
#[derive(Debug, Clone)]
pub struct Known {
    pub updated: i64,
    pub approvals_left: Option<i64>,
    pub approved_by: Vec<MrPerson>,
}

pub type MrKey = (i64, i64);

fn text(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

fn person(v: &Value) -> Option<MrPerson> {
    let username = text(&v["username"]);
    (!username.is_empty()).then(|| MrPerson { name: v["name"].as_str().filter(|n| !n.is_empty()).unwrap_or(&username).to_string(), username })
}

fn time(v: &Value) -> i64 {
    v.as_str().and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map_or(0, |d| d.timestamp_millis())
}

/// The project path from `references.full` ("group/project!12"), else from the URL.
fn project_path(mr: &Value) -> String {
    match text(&mr["references"]["full"]).split_once('!') {
        Some((p, _)) if !p.is_empty() => p.to_string(),
        _ => text(&mr["web_url"]).split("/-/").next().unwrap_or("").rsplit('/').take(2).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("/"),
    }
}

/// Words that look like a Jira key but are not one.
const NOT_KEYS: &[&str] = &["UTF", "ISO", "SHA", "MD", "HTTP", "HTTPS", "CVE", "RFC", "PNG", "TLS", "SSL", "TCP", "UDP", "ES", "IE"];

/// The first Jira-like key ("PROJ-123") in the title, else in the branch name (any case there).
pub fn task_key(title: &str, branch: &str) -> Option<String> {
    let find = |text: &str, any_case: bool| -> Option<String> {
        text.split(|c: char| !c.is_ascii_alphanumeric() && c != '-').find_map(|word| {
            let (prefix, num) = word.split_once('-')?;
            let digits: String = num.chars().take_while(|c| c.is_ascii_digit()).collect();
            let letters_ok = prefix.len() >= 2
                && prefix.len() <= 10
                && prefix.chars().next()?.is_ascii_alphabetic()
                && prefix.chars().all(|c| c.is_ascii_alphanumeric())
                && (any_case || prefix.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
            let key = prefix.to_ascii_uppercase();
            (letters_ok && !digits.is_empty() && digits.len() <= 7 && !NOT_KEYS.contains(&key.as_str())).then(|| format!("{key}-{digits}"))
        })
    };
    find(title, false).or_else(|| find(branch, true))
}

/// One entry of a list answer; approvals are filled in later.
pub fn parse_mr(v: &Value) -> Option<Mr> {
    let author = person(&v["author"])?;
    let status = text(&v["detailed_merge_status"]);
    Some(Mr {
        project_id: v["project_id"].as_i64()?,
        iid: v["iid"].as_i64()?,
        project: project_path(v),
        title: text(&v["title"]),
        url: text(&v["web_url"]),
        target_branch: text(&v["target_branch"]),
        task: task_key(&text(&v["title"]), &text(&v["source_branch"])),
        source_branch: text(&v["source_branch"]),
        author,
        draft: v["draft"].as_bool().or_else(|| v["work_in_progress"].as_bool()).unwrap_or(false),
        conflicts: v["has_conflicts"].as_bool().unwrap_or(false),
        discussions_resolved: v["blocking_discussions_resolved"].as_bool().unwrap_or(true),
        merge_status: if status.is_empty() { text(&v["merge_status"]) } else { status },
        comments: v["user_notes_count"].as_i64().unwrap_or(0),
        created: time(&v["created_at"]),
        updated: time(&v["updated_at"]),
        reviewers: v["reviewers"].as_array().into_iter().flatten().filter_map(person).collect(),
        approved_by: vec![],
        approvals_left: None,
        detailed: false,
        pipeline: None,
    })
}

/// The status of the newest pipeline in a `.../pipelines` answer (newest first).
pub fn latest_pipeline(v: &Value) -> Option<String> {
    v.as_array()?.first().map(|p| text(&p["status"])).filter(|s| !s.is_empty())
}

/// `GET .../approvals`: who approved and how many approvals are still needed.
pub fn parse_approvals(v: &Value) -> (Option<i64>, Vec<MrPerson>) {
    (v["approvals_left"].as_i64(), v["approved_by"].as_array().into_iter().flatten().filter_map(|a| person(&a["user"])).collect())
}

/// Merges the lists, dropping the same MR met twice (the first occurrence wins).
pub fn merge_lists(lists: Vec<Vec<Value>>) -> Vec<Mr> {
    let mut seen = std::collections::HashSet::new();
    lists.into_iter().flatten().filter_map(|v| parse_mr(&v)).filter(|m| seen.insert((m.project_id, m.iid))).take(MAX_MRS).collect()
}

async fn pages(gl: &GitLab<'_>, query: &[(&str, String)]) -> AppResult<Vec<Value>> {
    let mut out = vec![];
    for page in 1..=MAX_PAGES {
        let mut q = query.to_vec();
        q.push(("state", "opened".into()));
        q.push(("scope", "all".into()));
        q.push(("per_page", "100".into()));
        q.push(("page", page.to_string()));
        let v = gl.get("/merge_requests", &q).await?;
        let arr = v.as_array().cloned().unwrap_or_default();
        let n = arr.len();
        out.extend(arr);
        if n < 100 {
            break;
        }
    }
    Ok(out)
}

async fn author_pages(gl: &GitLab<'_>, user: String) -> Vec<Value> {
    pages(gl, &[("author_username", user)]).await.unwrap_or_default()
}

async fn with_approvals(gl: &GitLab<'_>, mut m: Mr, known: &HashMap<MrKey, Known>) -> Mr {
    if let Some(k) = known.get(&(m.project_id, m.iid)).filter(|k| k.updated == m.updated) {
        m.approvals_left = k.approvals_left;
        m.approved_by = k.approved_by.clone();
        m.detailed = true;
    } else if let Ok(v) = gl.get(&format!("/projects/{}/merge_requests/{}/approvals", m.project_id, m.iid), &[]).await {
        (m.approvals_left, m.approved_by) = parse_approvals(&v);
        m.detailed = true;
    }
    m
}

/// A pipeline ends without the MR changing, so its status is read on every load, for the most recently changed MRs.
async fn with_pipeline(gl: &GitLab<'_>, mut m: Mr) -> Mr {
    let path = format!("/projects/{}/merge_requests/{}/pipelines", m.project_id, m.iid);
    m.pipeline = gl.get(&path, &[("per_page", "1".into())]).await.ok().as_ref().and_then(latest_pipeline);
    m
}

pub async fn load(client: &reqwest::Client, base: &str, pat: &str, team: &[String], known: &HashMap<MrKey, Known>) -> AppResult<(MrPerson, Vec<Mr>)> {
    let gl = GitLab::new(client, base, pat);
    let me = person(&gl.get("/user", &[]).await?).unwrap_or(MrPerson { username: String::new(), name: String::new() });

    // Asked to review and written by the user: a failure here is the user's problem and is reported.
    let to_review = pages(&gl, &[("reviewer_username", me.username.clone())]).await?;
    let mine = pages(&gl, &[("author_username", me.username.clone())]).await?;
    // The team: one call per person (GitLab has no "any of these authors"); a person who cannot be read is skipped.
    let others: Vec<String> = team.iter().filter(|u| **u != me.username).cloned().collect();
    let teams: Vec<Vec<Value>> = stream::iter(others).map(|u| author_pages(&gl, u)).buffer_unordered(PARALLEL).collect().await;

    let mrs = merge_lists([vec![to_review, mine], teams].concat());
    // Approvals: reused while the MR is unchanged, read for new and changed ones.
    let mut mrs: Vec<Mr> = stream::iter(mrs).map(|m| with_approvals(&gl, m, known)).buffer_unordered(PARALLEL).collect().await;
    mrs.sort_by(|a, b| b.updated.cmp(&a.updated));
    let rest = mrs.split_off(mrs.len().min(MAX_PIPELINES));
    let mut mrs: Vec<Mr> = stream::iter(mrs).map(|m| with_pipeline(&gl, m)).buffered(PARALLEL).collect().await;
    mrs.extend(rest);
    Ok((me, mrs))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn raw(iid: i64, author: &str) -> Value {
        json!({
            "project_id": 7, "iid": iid, "title": "PROJ-1 fix", "web_url": "https://gl.example.com/team/app/-/merge_requests/1",
            "source_branch": "feature/PROJ-1", "target_branch": "release/1.2", "author": { "username": author, "name": "Author Name" },
            "draft": false, "has_conflicts": true, "blocking_discussions_resolved": false,
            "detailed_merge_status": "discussions_not_resolved", "user_notes_count": 4,
            "created_at": "2026-11-18T10:00:00.000Z", "updated_at": "2026-11-19T09:30:00.000Z",
            "references": { "full": "team/app!1" },
            "reviewers": [{ "username": "rev", "name": "Reviewer" }]
        })
    }

    #[test]
    fn a_list_entry_becomes_an_mr() {
        let m = parse_mr(&raw(1, "ann")).unwrap();
        assert_eq!((m.project_id, m.iid, m.project.as_str()), (7, 1, "team/app"));
        assert_eq!((m.author.username.as_str(), m.comments, m.conflicts, m.discussions_resolved), ("ann", 4, true, false));
        assert_eq!(m.merge_status, "discussions_not_resolved");
        assert_eq!(m.reviewers[0].username, "rev");
        assert_eq!((m.task.as_deref(), m.target_branch.as_str()), (Some("PROJ-1"), "release/1.2"));
        assert!(m.created < m.updated && !m.detailed && m.approvals_left.is_none());
    }

    #[test]
    fn the_task_is_read_from_the_title_or_the_branch() {
        assert_eq!(task_key("PROJ-12: fix", "feature/other-5").as_deref(), Some("PROJ-12"));
        assert_eq!(task_key("fix the thing", "feature/proj-345-fix_it").as_deref(), Some("PROJ-345"));
        assert_eq!(task_key("Add UTF-8 support", "main"), None);
        assert_eq!(task_key("lower-case 12", "x"), None);
        assert_eq!(task_key("[AB2-7] x", "").as_deref(), Some("AB2-7"));
    }

    #[test]
    fn the_newest_pipeline_gives_the_status() {
        assert_eq!(latest_pipeline(&json!([{ "id": 9, "status": "failed" }, { "id": 8, "status": "success" }])).as_deref(), Some("failed"));
        assert_eq!(latest_pipeline(&json!([])), None);
        assert_eq!(latest_pipeline(&json!({ "message": "404" })), None);
    }

    #[test]
    fn an_entry_without_ids_or_author_is_skipped() {
        assert!(parse_mr(&json!({ "iid": 1, "author": { "username": "a" } })).is_none());
        assert!(parse_mr(&json!({ "project_id": 1, "iid": 1 })).is_none());
    }

    #[test]
    fn the_same_mr_in_two_lists_is_kept_once() {
        let mrs = merge_lists(vec![vec![raw(1, "ann"), raw(2, "bob")], vec![raw(1, "ann")]]);
        assert_eq!(mrs.iter().map(|m| m.iid).collect::<Vec<_>>(), vec![1, 2]);
    }

    #[test]
    fn approvals_are_read_with_the_missing_count() {
        let (left, by) = parse_approvals(&json!({ "approvals_left": 1, "approved_by": [{ "user": { "username": "rev", "name": "Reviewer" } }] }));
        assert_eq!(left, Some(1));
        assert_eq!(by, vec![MrPerson { username: "rev".into(), name: "Reviewer".into() }]);
        assert_eq!(parse_approvals(&json!({})), (None, vec![]));
    }
}
