//! Reads `git log` of local repositories. Read-only.
use crate::model::Event;
use crate::util::truncate;
use chrono::DateTime;
use std::path::Path;
use std::process::Command;

fn git(repo: &str, args: &[String]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo).arg("-c").arg("core.quotepath=off").args(args);
    // A windowed app must not flash a console window for every git call.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().map_err(|e| format!("git не запустился: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "git ({repo}): {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

const DAY_MS: i64 = 86_400_000;
/// Record separator before each commit header, field separator inside it.
const FORMAT: &str = "--pretty=format:%x1e%H%x1f%aI%x1f%S%x1f%s";

/// Configured author patterns, or the repo's `user.email` when none are set.
fn authors_for(repo: &str, authors: &[String]) -> Result<Vec<String>, String> {
    let who: Vec<String> = authors.iter().filter(|a| !a.trim().is_empty()).cloned().collect();
    if !who.is_empty() {
        return Ok(who);
    }
    let email = git(repo, &["config".into(), "user.email".into()])?.trim().to_string();
    Ok(if email.is_empty() { vec![] } else { vec![email] })
}

fn log_args(since: &str, until: &str, who: &[String]) -> Vec<String> {
    let mut args: Vec<String> = ["log", "--all", "--no-merges", "--source", "--numstat"].map(String::from).to_vec();
    args.push(format!("--since={since}"));
    args.push(format!("--until={until}"));
    args.push(FORMAT.into());
    args.extend(who.iter().map(|a| format!("--author={a}")));
    args
}

/// `git log` output in FORMAT with --numstat -> commits inside [start_ms, end_ms).
fn parse_log(out: &str, repo_name: &str, start_ms: i64, end_ms: i64) -> Vec<Event> {
    let mut events = vec![];
    for chunk in out.split('\x1e').filter(|c| !c.trim().is_empty()) {
        let mut lines = chunk.lines();
        let Some(head) = lines.next() else { continue };
        let p: Vec<&str> = head.split('\x1f').collect();
        if p.len() < 4 {
            continue;
        }
        let Ok(dt) = DateTime::parse_from_rfc3339(p[1]) else { continue };
        let ts = dt.timestamp_millis();
        if ts < start_ms || ts >= end_ms {
            continue;
        }
        let (mut ins, mut del, mut files) = (0u64, 0u64, 0u64);
        for c in lines.map(|l| l.split('\t').collect::<Vec<_>>()).filter(|c| c.len() >= 3) {
            files += 1;
            ins += c[0].parse::<u64>().unwrap_or(0);
            del += c[1].parse::<u64>().unwrap_or(0);
        }
        let branch = p[2].trim_start_matches("refs/heads/").trim_start_matches("refs/remotes/");
        events.push(Event {
            context: Some(branch.to_string()),
            weight: ((ins + del) as f64).max(1.0),
            ..Event::new("git", ts, format!("[{repo_name}] {} (+{ins}/-{del}, файлов: {files})", truncate(p[3], 160)))
        });
    }
    events
}

/// The window is widened by a day on both sides: git dates are in the author's time zone.
pub fn fetch(repos: &[String], authors: &[String], start_ms: i64, end_ms: i64) -> Result<Vec<Event>, String> {
    let iso = |ms: i64, what: &str| DateTime::from_timestamp_millis(ms).map(|d| d.to_rfc3339()).ok_or(format!("bad {what}"));
    let since = iso(start_ms - DAY_MS, "since")?;
    let until = iso(end_ms + DAY_MS, "until")?;
    let mut events = vec![];
    for repo in repos.iter().filter(|r| !r.trim().is_empty()) {
        let path = Path::new(repo);
        if !path.exists() {
            return Err(format!("Репозиторий не найден: {repo}"));
        }
        let name = path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| repo.clone());
        let out = git(repo, &log_args(&since, &until, &authors_for(repo, authors)?))?;
        events.extend(parse_log(&out, &name, start_ms, end_ms));
    }
    Ok(events)
}

#[derive(Debug, serde::Serialize)]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
}

fn walk(dir: &Path, depth: u32, out: &mut Vec<RepoInfo>) {
    if dir.join(".git").exists() {
        out.push(RepoInfo {
            path: dir.to_string_lossy().to_string(),
            name: dir.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
        });
        return; // do not look for nested repos inside a repo
    }
    if depth == 0 {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || matches!(name.as_str(), "node_modules" | "target" | "dist" | "build") {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            walk(&p, depth - 1, out);
        }
    }
}

/// Finds git repositories under `root` (up to 3 levels deep).
pub fn scan(root: &str) -> Result<Vec<RepoInfo>, String> {
    let p = Path::new(root.trim());
    if !p.is_dir() {
        return Err(format!("Папка не найдена: {root}"));
    }
    let mut out = vec![];
    walk(p, 3, &mut out);
    out.sort_by_key(|r| r.name.to_lowercase());
    Ok(out)
}

/// `group/project` paths of the repositories' `origin` remotes that live on the given GitLab host.
pub fn remote_paths(repos: &[String], gitlab_url: &str) -> Vec<String> {
    let host = gitlab_url
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_lowercase();
    let mut out: Vec<String> = vec![];
    for r in repos {
        let Ok(url) = git(r, &["remote".to_string(), "get-url".to_string(), "origin".to_string()]) else { continue };
        if let Some(p) = parse_remote(url.trim(), &host) {
            if !out.contains(&p) {
                out.push(p);
            }
        }
    }
    out
}

/// https://host/a/b.git, ssh://git@host:2222/a/b.git, git@host:a/b.git  ->  a/b (lower case), only for `host`.
pub fn parse_remote(url: &str, host: &str) -> Option<String> {
    let (h, path) = if let Some(rest) = url.split_once("://").map(|x| x.1) {
        let rest = rest.rsplit_once('@').map(|x| x.1).unwrap_or(rest);
        let (h, p) = rest.split_once('/')?;
        (h.split(':').next()?.to_string(), p.to_string())
    } else {
        let rest = url.rsplit_once('@').map(|x| x.1).unwrap_or(url);
        let (h, p) = rest.split_once(':')?;
        (h.to_string(), p.to_string())
    };
    if !h.eq_ignore_ascii_case(host) {
        return None;
    }
    Some(path.trim_matches('/').trim_end_matches(".git").to_lowercase())
}

#[cfg(test)]
mod log_tests {
    use super::*;

    #[test]
    fn parses_commits_with_numstat() {
        let out = "\x1eabc\x1f2026-11-10T10:00:00+03:00\x1frefs/heads/feature/A-1\x1fA-1 fix\n3\t1\tsrc/a.rs\n2\t0\tsrc/b.rs\n\
                   \x1edef\x1f2026-12-01T10:00:00+03:00\x1frefs/heads/main\x1fout of range\n";
        let start = DateTime::parse_from_rfc3339("2026-11-10T00:00:00+03:00").unwrap().timestamp_millis();
        let ev = parse_log(out, "repo", start, start + 86_400_000);
        assert_eq!(ev.len(), 1);
        assert_eq!(ev[0].text, "[repo] A-1 fix (+5/-1, файлов: 2)");
        assert_eq!(ev[0].context.as_deref(), Some("feature/A-1"));
        assert_eq!(ev[0].weight, 6.0);
    }
}
