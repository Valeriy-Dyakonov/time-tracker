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
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskGit {
    pub commits: Vec<TaskCommit>,
    pub docs: Vec<TaskDoc>,
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

fn is_doc(path: &str, dirs: &[String]) -> bool {
    path.to_lowercase().ends_with(".md") && dirs.iter().any(|d| path.starts_with(&format!("{d}/")))
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

/// Commits that mention the key in any branch, and the notes under the per-task folders: as they are now
/// (HEAD, then branches named after the task), plus any committed version only seen in those commits.
pub fn find(repos: &[String], key: &str, doc_patterns: Option<&[String]>) -> TaskGit {
    let mut out = TaskGit::default();
    for repo in repos {
        let log = git(repo, &[
            "log".into(), "--all".into(), "--fixed-strings".into(), format!("--grep={key}"), "--name-only".into(),
            format!("-n{MAX_COMMITS}"), "--pretty=format:%x1e%H%x1f%aI%x1f%an%x1f%s".into(),
        ]);
        let commits = log.map(|o| parse_log(&o, repo)).unwrap_or_default();

        if let Some(patterns) = doc_patterns {
            let dirs = doc_dirs(patterns, key);
            let mut docs: BTreeMap<String, TaskDoc> = BTreeMap::new();
            let mut refs = vec!["HEAD".to_string()];
            if let Ok(r) = git(repo, &["for-each-ref".into(), "--format=%(refname)".into(), "refs/heads".into(), "refs/remotes".into()]) {
                refs.extend(r.lines().filter(|l| l.contains(key)).map(String::from));
            }
            for rev in &refs {
                let Ok(hash) = git(repo, &["rev-parse".into(), rev.clone()]) else { continue };
                let hash = hash.trim().to_string();
                let mut args = vec!["ls-tree".into(), "-r".into(), "--name-only".into(), hash.clone(), "--".into()];
                args.extend(dirs.iter().cloned());
                let Ok(files) = git(repo, &args) else { continue };
                for path in files.lines().map(str::trim).filter(|p| is_doc(p, &dirs)) {
                    docs.entry(path.to_string()).or_insert_with(|| TaskDoc {
                        repo: repo.clone(), repo_name: repo_name(repo), path: path.to_string(), commit: hash.clone(), date: commit_date(repo, &hash),
                    });
                }
            }
            for c in &commits {
                for path in c.files.iter().filter(|p| is_doc(p, &dirs)) {
                    docs.entry(path.clone()).or_insert_with(|| TaskDoc {
                        repo: repo.clone(), repo_name: repo_name(repo), path: path.clone(), commit: c.hash.clone(), date: c.date.clone(),
                    });
                }
            }
            out.docs.extend(docs.into_values());
        }
        out.commits.extend(commits);
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
        assert!(!is_doc("docs/ai/ABC-12/plan.md", &dirs));
        assert!(!is_doc("docs/ai/ABC-1/image.png", &dirs));
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
        run(&["commit", "-q", "-m", "ABC-1 add plan"]);
        run(&["checkout", "-q", "-b", "feature/ABC-1-ui"]);
        std::fs::write(dir.join("docs/ai/ABC-1/ui.md"), "ui notes").unwrap();
        run(&["add", "."]);
        run(&["commit", "-q", "-m", "wip"]);
        run(&["checkout", "-q", "main"]);

        let repos = vec![repo.clone()];
        let found = find(&repos, "ABC-1", Some(&["docs/ai/{key}".to_string()]));
        assert_eq!(found.commits.iter().map(|c| c.subject.as_str()).collect::<Vec<_>>(), ["ABC-1 add plan"]);
        let mut paths: Vec<&str> = found.docs.iter().map(|d| d.path.as_str()).collect();
        paths.sort();
        assert_eq!(paths, ["docs/ai/ABC-1/plan.md", "docs/ai/ABC-1/ui.md"]);
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
