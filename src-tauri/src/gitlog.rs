//! Reads `git log` of local repositories. Read-only.
use crate::settings::Event;
use crate::util::truncate;
use chrono::DateTime;
use std::path::Path;
use std::process::Command;

fn git(repo: &str, args: &[String]) -> Result<String, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .arg("-c")
        .arg("core.quotepath=off")
        .args(args)
        .output()
        .map_err(|e| format!("git не запустился: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "git ({repo}): {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn fetch(
    repos: &[String],
    authors: &[String],
    start_ms: i64,
    end_ms: i64,
) -> Result<Vec<Event>, String> {
    let mut events = vec![];
    let day_ms = 86_400_000i64;
    let since = DateTime::from_timestamp_millis(start_ms - day_ms)
        .ok_or("bad since")?
        .to_rfc3339();
    let until = DateTime::from_timestamp_millis(end_ms + day_ms)
        .ok_or("bad until")?
        .to_rfc3339();

    for repo in repos {
        if repo.trim().is_empty() {
            continue;
        }
        if !Path::new(repo).exists() {
            return Err(format!("Репозиторий не найден: {repo}"));
        }
        let name = Path::new(repo)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| repo.clone());

        let mut who: Vec<String> = authors.iter().filter(|a| !a.trim().is_empty()).cloned().collect();
        if who.is_empty() {
            let email = git(repo, &["config".into(), "user.email".into()])?.trim().to_string();
            if !email.is_empty() {
                who.push(email);
            }
        }

        let mut args: Vec<String> = vec![
            "log".into(),
            "--all".into(),
            "--no-merges".into(),
            "--source".into(),
            "--numstat".into(),
            format!("--since={since}"),
            format!("--until={until}"),
            "--pretty=format:%x1e%H%x1f%aI%x1f%S%x1f%s".into(),
        ];
        for a in &who {
            args.push(format!("--author={a}"));
        }

        let out = git(repo, &args)?;
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
            for l in lines {
                let c: Vec<&str> = l.split('\t').collect();
                if c.len() >= 3 {
                    files += 1;
                    ins += c[0].parse::<u64>().unwrap_or(0);
                    del += c[1].parse::<u64>().unwrap_or(0);
                }
            }
            let branch = p[2].trim_start_matches("refs/heads/").trim_start_matches("refs/remotes/");
            events.push(Event {
                source: "git".into(),
                ts,
                issue_key: None,
                text: format!("[{name}] {} (+{ins}/-{del}, файлов: {files})", truncate(p[3], 160)),
                context: Some(branch.to_string()),
                weight: ((ins + del) as f64).max(1.0),
            });
        }
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
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}
