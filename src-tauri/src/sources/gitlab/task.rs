//! Merge requests of one task and the task notes in their branches, through the GitLab API. Read-only:
//! finds notes even when the branch was never fetched locally.
use super::GitLab;
use crate::error::{AppError, AppResult};
use crate::sources::taskgit::{doc_dirs, is_doc, mentions_key};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

const MAX_MRS: usize = 15;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MrCommit {
    pub short: String,
    pub title: String,
    /// ISO 8601.
    pub date: String,
    pub author: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMr {
    pub project: String,
    pub project_id: u64,
    pub iid: u64,
    pub title: String,
    /// opened, merged, closed, locked.
    pub state: String,
    pub web_url: String,
    pub source_branch: String,
    pub target_branch: String,
    pub author: String,
    pub updated: String,
    pub commits: Vec<MrCommit>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDoc {
    pub project_id: u64,
    pub project: String,
    pub ref_name: String,
    pub path: String,
    pub mr_iid: u64,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMrs {
    /// GitLab is set up in the settings; when not, nothing was looked for.
    pub configured: bool,
    pub mrs: Vec<TaskMr>,
    pub docs: Vec<RemoteDoc>,
    /// Why GitLab could not be read (a code the UI words), next to whatever was found locally.
    pub error: Option<AppError>,
}

fn s(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

/// `group/project!12` -> `group/project`.
fn project_of(mr: &Value) -> String {
    let full = s(&mr["references"]["full"]);
    match full.split_once('!') {
        Some((p, _)) if !p.is_empty() => p.to_string(),
        _ => s(&mr["web_url"]).split("/-/").next().unwrap_or("").rsplit('/').take(2).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("/"),
    }
}

/// The key must really be in the MR: GitLab's search is fuzzy.
fn mentions(mr: &Value, key: &str) -> bool {
    [&mr["title"], &mr["description"], &mr["source_branch"]].iter().any(|v| v.as_str().is_some_and(|t| mentions_key(t, key)))
}

pub async fn find(client: &reqwest::Client, base: &str, pat: &str, key: &str, doc_patterns: Option<&[String]>) -> AppResult<TaskMrs> {
    let gl = GitLab::new(client, base, pat);
    let found = gl
        .get("/merge_requests", &[("scope", "all".into()), ("search", key.into()), ("order_by", "updated_at".into()), ("per_page", "40".into())])
        .await?;
    let list: Vec<&Value> = found.as_array().into_iter().flatten().filter(|m| mentions(m, key)).take(MAX_MRS).collect();
    let mut out = TaskMrs { configured: true, ..Default::default() };
    let mut docs: BTreeMap<String, RemoteDoc> = BTreeMap::new();

    for mr in list {
        let (pid, iid) = (mr["project_id"].as_u64().unwrap_or(0), mr["iid"].as_u64().unwrap_or(0));
        let project = project_of(mr);
        let commits = gl
            .get(&format!("/projects/{pid}/merge_requests/{iid}/commits"), &[("per_page", "50".into())])
            .await
            .map(|v| {
                v.as_array().into_iter().flatten().map(|c| MrCommit {
                    short: s(&c["short_id"]), title: s(&c["title"]), date: s(&c["created_at"]), author: s(&c["author_name"]),
                }).collect()
            })
            .unwrap_or_default();

        if let Some(patterns) = doc_patterns {
            // The source branch while the MR is open; the target branch once it is merged and the branch is gone.
            let refs = [s(&mr["source_branch"]), s(&mr["target_branch"])];
            let dirs: Vec<String> = [doc_dirs(patterns, key), doc_dirs(patterns, &key.to_lowercase())].concat();
            'refs: for r in refs.iter().filter(|r| !r.is_empty()) {
                let mut hit = false;
                for dir in &dirs {
                    let tree = gl
                        .get(&format!("/projects/{pid}/repository/tree"), &[("path", dir.clone()), ("ref", r.clone()), ("recursive", "true".into()), ("per_page", "100".into())])
                        .await;
                    for item in tree.ok().as_ref().and_then(|v| v.as_array()).into_iter().flatten() {
                        let path = s(&item["path"]);
                        if item["type"].as_str() == Some("blob") && is_doc(&path, &dirs) {
                            hit = true;
                            docs.entry(format!("{pid}:{path}")).or_insert(RemoteDoc { project_id: pid, project: project.clone(), ref_name: r.clone(), path, mr_iid: iid });
                        }
                    }
                }
                if hit {
                    break 'refs;
                }
            }
        }

        out.mrs.push(TaskMr {
            project, project_id: pid, iid, title: s(&mr["title"]), state: s(&mr["state"]), web_url: s(&mr["web_url"]),
            source_branch: s(&mr["source_branch"]), target_branch: s(&mr["target_branch"]), author: s(&mr["author"]["name"]),
            updated: s(&mr["updated_at"]), commits,
        });
    }
    out.docs = docs.into_values().collect();
    Ok(out)
}

/// One note from a project branch as text: a markdown path inside the repository only.
pub async fn read(client: &reqwest::Client, base: &str, pat: &str, project_id: u64, ref_name: &str, path: &str) -> AppResult<String> {
    let path_ok = path.to_lowercase().ends_with(".md") && !path.starts_with('/') && !path.split('/').any(|s| s == "..");
    let ref_ok = !ref_name.is_empty() && ref_name.len() <= 255 && !ref_name.chars().any(|c| c.is_control() || c == ' ');
    if project_id == 0 || !path_ok || !ref_ok {
        return Err(AppError::new("taskDocInvalid").with("path", path));
    }
    GitLab::new(client, base, pat)
        .get_text(&format!("/projects/{project_id}/repository/files/{}/raw", urlencoding::encode(path)), &[("ref", ref_name.into())])
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_only_mrs_that_really_mention_the_key() {
        assert!(mentions(&json!({ "title": "Fix import", "source_branch": "feature/abc-1-import" }), "ABC-1"));
        assert!(mentions(&json!({ "title": "ABC-1: plan", "description": null }), "ABC-1"));
        assert!(!mentions(&json!({ "title": "ABC-12 other", "source_branch": "x" }), "ABC-1"));
    }

    #[test]
    fn reads_the_project_path() {
        assert_eq!(project_of(&json!({ "references": { "full": "team/app!12" } })), "team/app");
        assert_eq!(project_of(&json!({ "web_url": "https://git/team/app/-/merge_requests/12" })), "team/app");
    }
}
