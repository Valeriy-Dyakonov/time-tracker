//! Tag search across projects: the newest tags whose name contains a text, per project, with the branches
//! that contain the tagged commit. Git does not record the branch a tag was made on, so these are the
//! branches reachable from it, the default branch first.
use super::GitLab;
use crate::error::AppError;
use chrono::DateTime;
use serde::Serialize;
use serde_json::Value;

/// Tags asked for per project; the newest few of them are kept.
const ASKED: &str = "20";
const KEPT: usize = 3;
const MAX_BRANCHES: usize = 5;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagHit {
    pub name: String,
    /// When the tag was made (the commit's date for a lightweight tag), ms; 0 when unknown.
    pub created: i64,
    pub sha: String,
    pub message: String,
    pub branches: Vec<String>,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceTags {
    pub project: String,
    pub url: String,
    pub tags: Vec<TagHit>,
    /// Why this project could not be read; the others are shown regardless.
    pub error: Option<AppError>,
}

fn text(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

fn time(v: &Value) -> i64 {
    v.as_str().and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map_or(0, |d| d.timestamp_millis())
}

/// Newest first, at most `KEPT`. The tag's own date is used when GitLab gives it, else the commit's.
fn parse_tags(list: &Value, project_url: &str) -> Vec<TagHit> {
    let mut tags: Vec<TagHit> = list
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|t| {
            let name = text(&t["name"]);
            if name.is_empty() {
                return None;
            }
            let own = time(&t["created_at"]);
            let created = if own > 0 { own } else { time(&t["commit"]["created_at"]).max(time(&t["commit"]["committed_date"])) };
            Some(TagHit {
                url: format!("{project_url}/-/tags/{}", urlencoding::encode(&name)),
                sha: text(&t["commit"]["short_id"]),
                message: text(&t["message"]),
                branches: vec![],
                created,
                name,
            })
        })
        .collect();
    tags.sort_by(|a, b| b.created.cmp(&a.created).then_with(|| a.name.cmp(&b.name)));
    tags.truncate(KEPT);
    tags
}

/// The default branch first, then the rest in the order GitLab gave; capped.
fn order_branches(refs: &Value, default: &str) -> Vec<String> {
    let mut names: Vec<String> = refs.as_array().into_iter().flatten().map(|r| text(&r["name"])).filter(|n| !n.is_empty()).collect();
    names.sort_by_key(|n| n != default);
    names.truncate(MAX_BRANCHES);
    names
}

async fn one(gl: &GitLab<'_>, path: &str, query: &str) -> ServiceTags {
    let failed = |e| ServiceTags { project: path.to_string(), url: String::new(), tags: vec![], error: Some(e) };
    let project = match gl.get(&format!("/projects/{}", urlencoding::encode(path)), &[]).await {
        Ok(p) => p,
        Err(e) => return failed(e),
    };
    let id = project["id"].as_u64().unwrap_or(0);
    let url = text(&project["web_url"]);
    let default = text(&project["default_branch"]);
    let list = match gl
        .get(
            &format!("/projects/{id}/repository/tags"),
            &[("search", query.to_string()), ("order_by", "updated".into()), ("sort", "desc".into()), ("per_page", ASKED.into())],
        )
        .await
    {
        Ok(l) => l,
        Err(e) => return failed(e),
    };
    let mut tags = parse_tags(&list, &url);
    for t in &mut tags {
        // A failed lookup only leaves the tag without branches.
        if let Ok(refs) = gl.get(&format!("/projects/{id}/repository/commits/{}/refs", t.sha), &[("type", "branch".into()), ("per_page", "50".into())]).await {
            t.branches = order_branches(&refs, &default);
        }
    }
    ServiceTags { project: text(&project["path_with_namespace"]), url, tags, error: None }
}

/// The latest tags matching `query` in one project (a path like `group/service`).
pub async fn service(client: &reqwest::Client, base: &str, pat: &str, path: &str, query: &str) -> ServiceTags {
    one(&GitLab::new(client, base, pat), path, query).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_newest_tags_by_creation_date() {
        let list = json!([
            { "name": "v1.0", "commit": { "short_id": "aaa", "created_at": "2026-01-01T10:00:00Z" } },
            { "name": "v1.2", "created_at": "2026-03-01T10:00:00Z", "message": "release", "commit": { "short_id": "bbb", "created_at": "2026-02-01T10:00:00Z" } },
            { "name": "v1.1", "commit": { "short_id": "ccc", "created_at": "2026-02-15T10:00:00Z" } },
            { "name": "v0.9", "commit": { "short_id": "ddd", "created_at": "2025-12-01T10:00:00Z" } },
        ]);
        let tags = parse_tags(&list, "https://gl/g/p");
        assert_eq!(tags.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(), ["v1.2", "v1.1", "v1.0"]);
        assert_eq!(tags[0].url, "https://gl/g/p/-/tags/v1.2");
        assert_eq!(tags[0].message, "release");
    }

    #[test]
    fn default_branch_goes_first() {
        let refs = json!([{ "name": "release/1.2" }, { "name": "main" }, { "name": "dev" }]);
        assert_eq!(order_branches(&refs, "main"), ["main", "release/1.2", "dev"]);
        assert_eq!(order_branches(&refs, ""), ["release/1.2", "main", "dev"]);
    }
}
