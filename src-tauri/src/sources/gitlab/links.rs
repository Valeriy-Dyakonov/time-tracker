//! GitLab links found in a task (its description, comments, Confluence pages, its own MRs), read as context
//! for the dashboard's AI analysis: an MR with its description, commits and diff, an issue with its
//! discussion, a file, a wiki page. Only links to the configured GitLab; read-only GETs.
use super::GitLab;
use crate::util::trim_url;
use serde::Serialize;
use serde_json::Value;

const MAX_LINKS: usize = 10;
const DIFF_PER_FILE: usize = 800;
const DIFF_TOTAL: usize = 6000;
const FILE_TEXT: usize = 4000;
const DESCRIPTION_SHORT: usize = 2000;
const NOTES: usize = 12;

#[derive(Debug, PartialEq)]
enum Target {
    Mr(u64),
    Issue(u64),
    /// `ref/path` together: a branch name may contain slashes, so the split is found by asking GitLab.
    File(String),
    Wiki(String),
}

#[derive(Debug, PartialEq)]
struct Link {
    project: String,
    target: Target,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLabItem {
    pub url: String,
    /// mr, issue, file, wiki.
    pub kind: String,
    pub title: String,
    pub text: String,
}

fn cut(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    format!("{}…", s.chars().take(max).collect::<String>())
}

fn number(s: &str) -> Option<u64> {
    s.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().ok()
}

/// `{base}/group/project/-/merge_requests/5`, `/-/issues/7`, `/-/blob/main/src/a.rs`, `/-/wikis/Page`.
fn parse_link(base: &str, url: &str) -> Option<Link> {
    let base = trim_url(base);
    let rest = url.strip_prefix(&base)?.strip_prefix('/')?;
    let rest = rest.split(['?', '#']).next()?;
    let (project, tail) = rest.split_once("/-/")?;
    if project.is_empty() {
        return None;
    }
    let (kind, arg) = tail.split_once('/')?;
    let target = match kind {
        "merge_requests" => Target::Mr(number(arg)?),
        "issues" | "work_items" => Target::Issue(number(arg)?),
        "blob" if arg.contains('/') => Target::File(urlencoding::decode(arg).ok()?.into_owned()),
        "wikis" if !arg.is_empty() => Target::Wiki(arg.trim_end_matches('/').to_string()),
        _ => return None,
    };
    Some(Link { project: project.to_string(), target })
}

/// Lock files, generated and binary-ish files: their diff says nothing about the change.
fn noise(path: &str) -> bool {
    let p = path.to_lowercase();
    let name = p.rsplit('/').next().unwrap_or(&p);
    name.ends_with(".lock") || name == "package-lock.json" || name == "pnpm-lock.yaml" || name == "go.sum"
        || [".min.js", ".min.css", ".map", ".snap", ".svg", ".png", ".jpg", ".gif", ".ico", ".pdf"].iter().any(|e| name.ends_with(e))
        || p.contains("/generated/") || p.starts_with("generated/") || p.contains("/dist/") || p.contains("/vendor/")
}

fn s(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

async fn mr(gl: &GitLab<'_>, p: &str, iid: u64) -> Option<(String, String)> {
    let m = gl.get(&format!("/projects/{p}/merge_requests/{iid}"), &[]).await.ok()?;
    let mut text = format!(
        "{} → {} [{}]\n{}",
        s(&m["source_branch"]), s(&m["target_branch"]), s(&m["state"]), cut(&s(&m["description"]), DESCRIPTION_SHORT)
    );
    if let Ok(c) = gl.get(&format!("/projects/{p}/merge_requests/{iid}/commits"), &[("per_page", "30".into())]).await {
        let titles: Vec<String> = c.as_array().into_iter().flatten().map(|c| format!("- {}", s(&c["title"]))).collect();
        if !titles.is_empty() {
            text.push_str(&format!("\n\nCommits:\n{}", titles.join("\n")));
        }
    }
    let diffs = match gl.get(&format!("/projects/{p}/merge_requests/{iid}/diffs"), &[("per_page", "100".into())]).await {
        Ok(v) => v,
        Err(_) => gl.get(&format!("/projects/{p}/merge_requests/{iid}/changes"), &[]).await.map(|v| v["changes"].clone()).unwrap_or_default(),
    };
    let mut diff = String::new();
    for d in diffs.as_array().into_iter().flatten().filter(|d| !noise(&s(&d["new_path"]))) {
        if diff.chars().count() >= DIFF_TOTAL {
            diff.push_str("\n…");
            break;
        }
        diff.push_str(&format!("\n--- {}\n{}", s(&d["new_path"]), cut(&s(&d["diff"]), DIFF_PER_FILE)));
    }
    if !diff.is_empty() {
        text.push_str(&format!("\n\nDiff:{diff}"));
    }
    Some((s(&m["title"]), text))
}

async fn issue(gl: &GitLab<'_>, p: &str, iid: u64) -> Option<(String, String)> {
    let i = gl.get(&format!("/projects/{p}/issues/{iid}"), &[]).await.ok()?;
    let mut text = format!("[{}]\n{}", s(&i["state"]), cut(&s(&i["description"]), DESCRIPTION_SHORT));
    if let Ok(n) = gl.get(&format!("/projects/{p}/issues/{iid}/notes"), &[("sort", "asc".into()), ("per_page", "100".into())]).await {
        let notes: Vec<String> = n
            .as_array()
            .into_iter()
            .flatten()
            .filter(|n| n["system"].as_bool() != Some(true))
            .map(|n| format!("- {}: {}", s(&n["author"]["name"]), cut(&s(&n["body"]), 800)))
            .collect();
        let from = notes.len().saturating_sub(NOTES);
        if !notes.is_empty() {
            text.push_str(&format!("\n\nDiscussion:\n{}", notes[from..].join("\n")));
        }
    }
    Some((s(&i["title"]), text))
}

/// `ref/path`: tries the shortest ref first (main, then release/1.2, ...).
async fn file(gl: &GitLab<'_>, p: &str, ref_path: &str) -> Option<(String, String)> {
    let parts: Vec<&str> = ref_path.split('/').collect();
    for n in 1..parts.len().min(4) {
        let (r, path) = (parts[..n].join("/"), parts[n..].join("/"));
        if path.is_empty() || path.split('/').any(|x| x == "..") {
            continue;
        }
        let url = format!("/projects/{p}/repository/files/{}/raw", urlencoding::encode(&path));
        if let Ok(t) = gl.get_text(&url, &[("ref", r)]).await {
            if t.contains('\0') {
                return None;
            }
            return Some((path, cut(&t, FILE_TEXT)));
        }
    }
    None
}

async fn wiki(gl: &GitLab<'_>, p: &str, slug: &str) -> Option<(String, String)> {
    let w = gl.get(&format!("/projects/{p}/wikis/{}", urlencoding::encode(slug)), &[]).await.ok()?;
    Some((s(&w["title"]), cut(&s(&w["content"]), FILE_TEXT)))
}

/// Reads the GitLab links among `urls` (others are skipped), at most ten, in order.
pub async fn read(client: &reqwest::Client, base: &str, pat: &str, urls: &[String]) -> Vec<GitLabItem> {
    let gl = GitLab::new(client, base, pat);
    let mut out = vec![];
    let mut seen = std::collections::HashSet::new();
    for url in urls {
        if out.len() >= MAX_LINKS {
            break;
        }
        let Some(link) = parse_link(base, url) else { continue };
        if !seen.insert(format!("{}|{:?}", link.project.to_lowercase(), link.target)) {
            continue;
        }
        let p = urlencoding::encode(&link.project).into_owned();
        let (kind, got) = match &link.target {
            Target::Mr(iid) => ("mr", mr(&gl, &p, *iid).await),
            Target::Issue(iid) => ("issue", issue(&gl, &p, *iid).await),
            Target::File(rp) => ("file", file(&gl, &p, rp).await),
            Target::Wiki(slug) => ("wiki", wiki(&gl, &p, slug).await),
        };
        if let Some((title, text)) = got {
            out.push(GitLabItem { url: url.clone(), kind: kind.into(), title, text });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_noise_in_diffs() {
        assert!(noise("Cargo.lock") && noise("web/package-lock.json") && noise("api/generated/client.ts") && noise("a/logo.svg"));
        assert!(!noise("src/fees/calc.rs") && !noise("docs/api.md"));
    }

    #[test]
    fn recognises_links_to_this_gitlab_only() {
        let b = "https://git.co/";
        let l = |u: &str| parse_link(b, u);
        assert_eq!(l("https://git.co/team/app/-/merge_requests/12/diffs#x"), Some(Link { project: "team/app".into(), target: Target::Mr(12) }));
        assert_eq!(l("https://git.co/a/b/c/-/issues/7"), Some(Link { project: "a/b/c".into(), target: Target::Issue(7) }));
        assert_eq!(l("https://git.co/t/a/-/blob/feature/x/src/a%20b.rs"), Some(Link { project: "t/a".into(), target: Target::File("feature/x/src/a b.rs".into()) }));
        assert_eq!(l("https://git.co/t/a/-/wikis/Design/API"), Some(Link { project: "t/a".into(), target: Target::Wiki("Design/API".into()) }));
        assert_eq!(l("https://git.co/t/a/-/pipelines/5"), None);
        assert_eq!(l("https://other.co/t/a/-/merge_requests/1"), None);
        assert_eq!(l("https://git.co.evil/t/a/-/merge_requests/1"), None);
    }
}
