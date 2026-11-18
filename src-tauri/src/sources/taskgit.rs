//! What local repositories know about one task: commits that mention its key and, when enabled, the
//! markdown notes kept under per-task folders (e.g. `docs/ai/ABC-1/`). Read-only: log, ls-tree, show.
use super::gitlog::git;
use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;

const MAX_COMMITS: usize = 40;
const MAX_FILES: usize = 30;
/// Notes are read as text; anything bigger is not a note.
const MAX_DOC_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCommit {
    pub repo: String,
    pub hash: String,
    /// ISO 8601.
    pub date: String,
    pub author: String,
    pub subject: String,
    pub files: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDoc {
    /// Repository path as configured: the read command only accepts configured repositories.
    pub repo: String,
    pub repo_name: String,
    pub path: String,
    pub commit: String,
    /// ISO 8601 date of that commit.
    pub date: String,
    /// The file on the repository's web page (from `origin`), when the remote is a known web host.
    pub web_url: Option<String>,
}

/// Where the search looked, so the user can tell "nothing there" from "not looked".
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSearch {
    pub repo_name: String,
    /// Refs whose trees were searched for notes: HEAD and branches named after the task.
    pub refs: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskGit {
    pub commits: Vec<TaskCommit>,
    pub docs: Vec<TaskDoc>,
    pub searched: Vec<RepoSearch>,
    pub docs_enabled: bool,
}

fn repo_name(repo: &str) -> String {
    Path::new(repo).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| repo.to_string())
}

/// `docs/ai/{key}` -> `docs/ai/ABC-1`, without leading/trailing slashes.
pub fn doc_dirs(patterns: &[String], key: &str) -> Vec<String> {
    patterns
        .iter()
        .map(|p| p.trim().replace('\\', "/").trim_matches('/').replace("{key}", key))
        .filter(|p| !p.is_empty() && !p.split('/').any(|s| s == ".."))
        .collect()
}

/// A markdown file under a note folder (at any depth, e.g. `service/docs/ai/ABC-1/x.md`) or named after it
/// (`docs/ai/ABC-1.md`). Case-insensitive: keys and folders are written in either case.
pub fn is_doc(path: &str, dirs: &[String]) -> bool {
    let p = path.to_lowercase();
    p.ends_with(".md")
        && dirs.iter().map(|d| d.to_lowercase()).any(|d| {
            p.starts_with(&format!("{d}/")) || p.contains(&format!("/{d}/")) || p == format!("{d}.md") || p.ends_with(&format!("/{d}.md"))
        })
}

/// The key as a whole word, any case: ABC-1 is in "feature/abc-1-ui" but not in "ABC-12".
pub fn mentions_key(text: &str, key: &str) -> bool {
    let (t, k) = (text.to_lowercase(), key.to_lowercase());
    t.match_indices(&k).any(|(i, _)| {
        let before = t[..i].chars().next_back();
        let after = t[i + k.len()..].chars().next();
        !before.is_some_and(|c| c.is_alphanumeric()) && !after.is_some_and(|c| c.is_ascii_digit())
    })
}

/// `git@host:g/p.git`, `ssh://git@host:22/g/p.git`, `https://user@host/g/p.git` -> `https://host/g/p`.
pub fn web_base(remote: &str) -> Option<String> {
    let r = remote.trim().trim_end_matches('/').trim_end_matches(".git");
    let (host, path) = if let Some(rest) = r.strip_prefix("https://").or_else(|| r.strip_prefix("http://")).or_else(|| r.strip_prefix("ssh://")) {
        let rest = rest.rsplit_once('@').map_or(rest, |(_, h)| h);
        let (host, path) = rest.split_once('/')?;
        // ssh://host:2222/... carries the ssh port, not the web one.
        let host = if r.starts_with("ssh://") { host.split(':').next()? } else { host };
        (host.to_string(), path.to_string())
    } else {
        let rest = r.rsplit_once('@').map_or(r, |(_, h)| h);
        let (host, path) = rest.split_once(':')?;
        // C:/repos/app is a local remote, not host:path.
        if host.len() == 1 || path.contains('\\') {
            return None;
        }
        (host.to_string(), path.to_string())
    };
    (!host.is_empty() && !path.is_empty() && !host.contains(char::is_whitespace)).then(|| format!("https://{host}/{}", path.trim_start_matches('/')))
}

/// A file at a commit on the web page: GitHub's `/blob/`, GitLab's (and the rest) `/-/blob/`.
pub fn file_url(base: &str, commit: &str, path: &str) -> String {
    let blob = if base.starts_with("https://github.com/") { "blob" } else { "-/blob" };
    format!("{base}/{blob}/{commit}/{path}")
}

fn short_ref(r: &str) -> String {
    r.trim_start_matches("refs/heads/").trim_start_matches("refs/remotes/").to_string()
}

/// `git log` records: \x1e before each commit, \x1f between header fields, then one changed file per line.
fn parse_log(out: &str, repo: &str) -> Vec<TaskCommit> {
    out.split('\x1e')
        .filter_map(|rec| {
            let mut lines = rec.lines();
            let head: Vec<&str> = lines.next()?.split('\x1f').collect();
            if head.len() < 4 {
                return None;
            }
            Some(TaskCommit {
                repo: repo_name(repo),
                hash: head[0].to_string(),
                date: head[1].to_string(),
                author: head[2].to_string(),
                subject: head[3].to_string(),
                files: lines.map(str::trim).filter(|l| !l.is_empty()).take(MAX_FILES).map(String::from).collect(),
            })
        })
        .collect()
}

fn commit_date(repo: &str, rev: &str) -> String {
    git(repo, &["show".into(), "-s".into(), "--format=%aI".into(), rev.into()]).map(|s| s.trim().to_string()).unwrap_or_default()
}

/// Commits that mention the key (any case) in any branch, and the notes under the per-task folders: as they
/// are in HEAD and in branches named after the task, plus any version only seen in those commits.
pub fn find(repos: &[String], key: &str, doc_patterns: Option<&[String]>) -> TaskGit {
    let mut out = TaskGit { docs_enabled: doc_patterns.is_some(), ..Default::default() };
    for repo in repos {
        let mut search = RepoSearch { repo_name: repo_name(repo), refs: vec![], error: None };
        let log = git(repo, &[
            // Whole key only: ABC-1 must not pick up ABC-12. Keys are [A-Z0-9_-], safe inside a regex.
            "log".into(), "--all".into(), "--extended-regexp".into(), "--regexp-ignore-case".into(),
            format!("--grep=(^|[^[:alnum:]]){key}([^[:digit:]]|$)"),
            "--name-only".into(), format!("-n{MAX_COMMITS}"), "--pretty=format:%x1e%H%x1f%aI%x1f%an%x1f%s".into(),
        ]);
        let commits = match log {
            Ok(o) => parse_log(&o, repo),
            Err(e) => {
                search.error = Some(e.to_string());
                out.searched.push(search);
                continue;
            }
        };

        if let Some(patterns) = doc_patterns {
            let dirs = doc_dirs(patterns, key);
            let web = git(repo, &["remote".into(), "get-url".into(), "origin".into()]).ok().and_then(|r| web_base(&r));
            let url = |commit: &str, path: &str| web.as_deref().map(|b| file_url(b, commit, path));
            let mut docs: BTreeMap<String, TaskDoc> = BTreeMap::new();
            let mut refs = vec!["HEAD".to_string()];
            if let Ok(r) = git(repo, &["for-each-ref".into(), "--format=%(refname)".into(), "refs/heads".into(), "refs/remotes".into()]) {
                refs.extend(r.lines().filter(|l| mentions_key(l, key)).map(String::from));
            }
            for rev in &refs {
                let Ok(hash) = git(repo, &["rev-parse".into(), format!("{rev}^{{commit}}")]) else { continue };
                let hash = hash.trim().to_string();
                search.refs.push(short_ref(rev));
                // The whole tree, filtered here: git's own path filter is case-sensitive and root-anchored.
                let Ok(files) = git(repo, &["ls-tree".into(), "-r".into(), "--name-only".into(), hash.clone()]) else { continue };
                for path in files.lines().map(str::trim).filter(|p| is_doc(p, &dirs)) {
                    docs.entry(path.to_string()).or_insert_with(|| TaskDoc {
                        repo: repo.clone(), repo_name: repo_name(repo), path: path.to_string(), commit: hash.clone(), date: commit_date(repo, &hash),
                        web_url: url(&hash, path),
                    });
                }
            }
            for c in &commits {
                for path in c.files.iter().filter(|p| is_doc(p, &dirs)) {
                    docs.entry(path.clone()).or_insert_with(|| TaskDoc {
                        repo: repo.clone(), repo_name: repo_name(repo), path: path.clone(), commit: c.hash.clone(), date: c.date.clone(),
                        web_url: url(&c.hash, path),
                    });
                }
            }
            out.docs.extend(docs.into_values());
        }
        out.commits.extend(commits);
        out.searched.push(search);
    }
    out.commits.sort_by(|a, b| b.date.cmp(&a.date));
    out
}

/// One note as text. Only from a configured repository, a commit hash, and a markdown path inside the repo.
pub fn read(repos: &[String], repo: &str, commit: &str, path: &str) -> AppResult<String> {
    let commit_ok = (7..=40).contains(&commit.len()) && commit.chars().all(|c| c.is_ascii_hexdigit());
    let path_ok = path.to_lowercase().ends_with(".md") && !path.starts_with('/') && !path.contains(':') && !path.split('/').any(|s| s == "..");
    if !repos.iter().any(|r| r == repo) || !commit_ok || !path_ok {
        return Err(AppError::new("taskDocInvalid").with("path", path));
    }
    let text = git(repo, &["show".into(), format!("{commit}:{path}")])?;
    if text.len() > MAX_DOC_BYTES {
        return Ok(text.chars().take(MAX_DOC_BYTES).collect());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_patterns_and_matches_notes() {
        let dirs = doc_dirs(&["docs/ai/{key}".into(), "/ai/{key}/".into(), "../x/{key}".into(), " ".into()], "ABC-1");
        assert_eq!(dirs, ["docs/ai/ABC-1", "ai/ABC-1"]);
        assert!(is_doc("docs/ai/ABC-1/plan.md", &dirs));
        assert!(is_doc("ai/ABC-1/sub/notes.MD", &dirs));
        assert!(is_doc("docs/ai/abc-1/plan.md", &dirs));
        assert!(is_doc("service/docs/ai/ABC-1/plan.md", &dirs));
        assert!(is_doc("docs/ai/ABC-1.md", &dirs));
        assert!(!is_doc("docs/ai/ABC-12/plan.md", &dirs));
        assert!(!is_doc("docs/ai/ABC-1/image.png", &dirs));
        assert!(!is_doc("docs/aix/ABC-1/plan.md", &dirs));
    }

    #[test]
    fn builds_web_links_from_remotes() {
        assert_eq!(web_base("git@gitlab.corp:team/app.git").as_deref(), Some("https://gitlab.corp/team/app"));
        assert_eq!(web_base("ssh://git@gitlab.corp:2222/team/app.git").as_deref(), Some("https://gitlab.corp/team/app"));
        assert_eq!(web_base("https://user@gitlab.corp/team/sub/app.git
").as_deref(), Some("https://gitlab.corp/team/sub/app"));
        assert_eq!(web_base("C:/repos/app"), None);
        assert_eq!(file_url("https://gitlab.corp/t/a", "abc", "docs/ai/X-1/a.md"), "https://gitlab.corp/t/a/-/blob/abc/docs/ai/X-1/a.md");
        assert_eq!(file_url("https://github.com/t/a", "abc", "a.md"), "https://github.com/t/a/blob/abc/a.md");
    }

    #[test]
    fn matches_the_key_as_a_whole_word() {
        assert!(mentions_key("refs/heads/feature/abc-1-ui", "ABC-1"));
        assert!(mentions_key("ABC-1: plan", "ABC-1"));
        assert!(!mentions_key("ABC-12 other", "ABC-1"));
        assert!(!mentions_key("XABC-1", "ABC-1"));
    }

    #[test]
    fn parses_commits_with_files() {
        let out = "\x1eabc123\x1f2026-11-10T10:00:00+03:00\x1fIvan\x1fABC-1 add plan\ndocs/ai/ABC-1/plan.md\nsrc/a.rs\n\x1edef456\x1f2026-11-09T09:00:00+03:00\x1fIvan\x1fABC-1 start\n";
        let c = parse_log(out, "C:/work/repo");
        assert_eq!(c.len(), 2);
        assert_eq!((c[0].repo.as_str(), c[0].subject.as_str(), c[0].files.len()), ("repo", "ABC-1 add plan", 2));
        assert!(c[1].files.is_empty());
    }

    /// Real git: a temporary repository with a task commit, a note on a task branch and one in HEAD.
    #[test]
    fn finds_commits_and_notes_in_a_real_repository() {
        let dir = std::env::temp_dir().join(format!("taskgit-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("docs/ai/ABC-1")).unwrap();
        let repo = dir.to_string_lossy().replace('\\', "/");
        let run = |args: &[&str]| git(&repo, &args.iter().map(|s| s.to_string()).collect::<Vec<_>>()).unwrap();
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "t@t"]);
        run(&["config", "user.name", "T"]);
        std::fs::write(dir.join("docs/ai/ABC-1/plan.md"), "# Plan\nstep one").unwrap();
        run(&["add", "."]);
        run(&["commit", "-q", "-m", "abc-1 add plan"]);
        std::fs::write(dir.join("other.txt"), "x").unwrap();
        run(&["add", "."]);
        run(&["commit", "-q", "-m", "ABC-12 unrelated"]);
        run(&["checkout", "-q", "-b", "feature/abc-1-ui"]);
        std::fs::create_dir_all(dir.join("svc/docs/ai/abc-1")).unwrap();
        std::fs::write(dir.join("svc/docs/ai/abc-1/ui.md"), "ui notes").unwrap();
        run(&["add", "."]);
        run(&["commit", "-q", "-m", "wip"]);
        run(&["checkout", "-q", "main"]);

        let repos = vec![repo.clone()];
        let found = find(&repos, "ABC-1", Some(&["docs/ai/{key}".to_string()]));
        assert_eq!(found.commits.iter().map(|c| c.subject.as_str()).collect::<Vec<_>>(), ["abc-1 add plan"]);
        let mut paths: Vec<&str> = found.docs.iter().map(|d| d.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, ["docs/ai/ABC-1/plan.md", "svc/docs/ai/abc-1/ui.md"]);
        assert_eq!(found.searched[0].refs, ["HEAD", "feature/abc-1-ui"]);
        assert!(found.docs_enabled);
        let ui = found.docs.iter().find(|d| d.path.ends_with("ui.md")).unwrap();
        assert_eq!(read(&repos, &repo, &ui.commit, &ui.path).unwrap(), "ui notes");
        assert!(find(&repos, "ABC-1", None).docs.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_only_safe_targets() {
        let repos = vec!["C:/work/repo".to_string()];
        assert!(read(&repos, "C:/other", "abcdef1", "docs/a.md").is_err());
        assert!(read(&repos, "C:/work/repo", "HEAD", "docs/a.md").is_err());
        assert!(read(&repos, "C:/work/repo", "abcdef1", "../secret.md").is_err());
        assert!(read(&repos, "C:/work/repo", "abcdef1", "docs/a.txt").is_err());
    }
}
