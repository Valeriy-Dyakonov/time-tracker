//! What is behind an MR's indicators, read when the user opens a card: the latest pipeline (and, when it failed,
//! the stage, the failed jobs and the lines of their logs that say why) and the unresolved review threads. Read-only,
//! nothing is stored.
use super::GitLab;
use crate::error::AppResult;
use crate::util::truncate;
use serde::Serialize;
use serde_json::Value;

const MAX_JOBS: usize = 5;
const MAX_LINES: usize = 14;
const LINE_CHARS: usize = 300;
const MAX_THREADS: usize = 40;
const THREAD_CHARS: usize = 800;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedJob {
    pub id: i64,
    pub name: String,
    pub stage: String,
    pub reason: String,
    pub url: String,
    /// The lines of the log that tell what went wrong, in log order.
    pub lines: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pipeline {
    pub status: String,
    pub url: String,
    /// The earliest stage with a failed job.
    pub failed_stage: Option<String>,
    pub jobs: Vec<FailedJob>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub note_id: i64,
    pub author: String,
    pub body: String,
    pub file: Option<String>,
    pub line: Option<i64>,
    pub replies: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MrDetail {
    pub pipeline: Option<Pipeline>,
    /// Unresolved review threads.
    pub threads: Vec<Thread>,
    /// Threads already resolved.
    pub resolved: usize,
}

fn text(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

/// Escape sequences (colours, cursor moves) and carriage returns of a CI log removed.
fn plain(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\x1b' => {
                if chars.peek() == Some(&'[') {
                    chars.next();
                }
                for n in chars.by_ref() {
                    if n.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            '\r' => {}
            c => out.push(c),
        }
    }
    out.trim().to_string()
}

const MARKERS: &[&str] = &[
    "error", "failed", "failure", "fatal", "exception", "panic", "traceback", "cannot ", "can't ", "could not", "not found",
    "denied", "timed out", "timeout", "exit code", "exited with", "npm err", "assertion", "✖", "✗",
];

/// The lines of a job log that explain the failure: those with an error word (the last ones, as the cause is
/// near the end), else the tail of the log. GitLab's own section markers are skipped.
pub fn error_lines(trace: &str) -> Vec<String> {
    let lines: Vec<String> = trace
        .lines()
        .map(plain)
        .filter(|l| !l.is_empty() && !l.starts_with("section_start:") && !l.starts_with("section_end:"))
        .collect();
    let mut hits: Vec<&String> = lines.iter().filter(|l| MARKERS.iter().any(|m| l.to_lowercase().contains(m))).collect();
    hits.dedup();
    let chosen: Vec<&String> = if hits.is_empty() { lines.iter().rev().take(10).rev().collect() } else { hits.into_iter().rev().take(MAX_LINES).rev().collect() };
    chosen.into_iter().map(|l| truncate(l, LINE_CHARS)).collect()
}

async fn pipeline(gl: &GitLab<'_>, project: i64, iid: i64) -> Option<Pipeline> {
    let list = gl.get(&format!("/projects/{project}/merge_requests/{iid}/pipelines"), &[("per_page", "1".into())]).await.ok()?;
    let p = list.as_array()?.first()?.clone();
    let id = p["id"].as_i64()?;
    let status = text(&p["status"]);
    let mut out = Pipeline { status: status.clone(), url: text(&p["web_url"]), failed_stage: None, jobs: vec![] };
    if status != "failed" {
        return Some(out);
    }
    let jobs = gl.get(&format!("/projects/{project}/pipelines/{id}/jobs"), &[("scope[]", "failed".into()), ("per_page", "50".into())]).await.ok()?;
    let mut jobs: Vec<&Value> = jobs.as_array()?.iter().filter(|j| j["allow_failure"].as_bool() != Some(true)).collect();
    // The job ids grow with the pipeline's stages, so the lowest id is the stage that broke it first.
    jobs.sort_by_key(|j| j["id"].as_i64().unwrap_or(i64::MAX));
    out.failed_stage = jobs.first().map(|j| text(&j["stage"])).filter(|s| !s.is_empty());
    for j in jobs.into_iter().take(MAX_JOBS) {
        let jid = j["id"].as_i64().unwrap_or(0);
        let trace = gl.get_text(&format!("/projects/{project}/jobs/{jid}/trace"), &[]).await.unwrap_or_default();
        out.jobs.push(FailedJob {
            id: jid,
            name: text(&j["name"]),
            stage: text(&j["stage"]),
            reason: text(&j["failure_reason"]),
            url: text(&j["web_url"]),
            lines: error_lines(&trace),
        });
    }
    Some(out)
}

/// Unresolved threads (first note of each) and the number of resolved ones.
pub fn parse_threads(discussions: &Value) -> (Vec<Thread>, usize) {
    let mut open = vec![];
    let mut resolved = 0;
    for d in discussions.as_array().into_iter().flatten() {
        let notes: Vec<&Value> = d["notes"].as_array().into_iter().flatten().filter(|n| n["system"].as_bool() != Some(true)).collect();
        let Some(first) = notes.iter().find(|n| n["resolvable"].as_bool() == Some(true)) else { continue };
        if notes.iter().filter(|n| n["resolvable"].as_bool() == Some(true)).all(|n| n["resolved"].as_bool() == Some(true)) {
            resolved += 1;
            continue;
        }
        let pos = &first["position"];
        open.push(Thread {
            note_id: first["id"].as_i64().unwrap_or(0),
            author: first["author"]["name"].as_str().or(first["author"]["username"].as_str()).unwrap_or("").to_string(),
            body: truncate(text(&first["body"]).trim(), THREAD_CHARS),
            file: pos["new_path"].as_str().or(pos["old_path"].as_str()).map(String::from),
            line: pos["new_line"].as_i64().or(pos["old_line"].as_i64()),
            replies: notes.len().saturating_sub(1),
        });
    }
    open.truncate(MAX_THREADS);
    (open, resolved)
}

pub async fn read(client: &reqwest::Client, base: &str, pat: &str, project: i64, iid: i64) -> AppResult<MrDetail> {
    let gl = GitLab::new(client, base, pat);
    let pipeline = pipeline(&gl, project, iid).await;
    let mut all = vec![];
    for page in 1..=3 {
        let v = gl
            .get(&format!("/projects/{project}/merge_requests/{iid}/discussions"), &[("per_page", "100".into()), ("page", page.to_string())])
            .await?;
        let arr = v.as_array().cloned().unwrap_or_default();
        let n = arr.len();
        all.extend(arr);
        if n < 100 {
            break;
        }
    }
    let (threads, resolved) = parse_threads(&Value::Array(all));
    Ok(MrDetail { pipeline, threads, resolved })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn colours_and_carriage_returns_are_removed() {
        assert_eq!(plain("\x1b[31;1mERROR:\x1b[0m boom\r"), "ERROR: boom");
        assert_eq!(plain("\x1b[0K\x1b[32;1mRunning\x1b[0;m"), "Running");
    }

    #[test]
    fn the_log_lines_with_the_cause_are_picked_in_order() {
        let log = "section_start:1:step\nInstalling\n\x1b[31mnpm ERR! code ELIFECYCLE\x1b[0m\nok\nsrc/a.ts(3,1): error TS2304: Cannot find name 'x'.\nERROR: Job failed: exit code 1\n";
        assert_eq!(
            error_lines(log),
            vec!["npm ERR! code ELIFECYCLE", "src/a.ts(3,1): error TS2304: Cannot find name 'x'.", "ERROR: Job failed: exit code 1"]
        );
    }

    #[test]
    fn a_log_without_error_words_gives_its_tail() {
        let log = (1..=20).map(|i| format!("line {i}")).collect::<Vec<_>>().join("\n");
        let lines = error_lines(&log);
        assert_eq!((lines.len(), lines[0].as_str(), lines[9].as_str()), (10, "line 11", "line 20"));
        assert!(error_lines("").is_empty());
    }

    #[test]
    fn a_long_log_keeps_the_last_matches() {
        let log = (1..=40).map(|i| format!("error number {i}")).collect::<Vec<_>>().join("\n");
        let lines = error_lines(&log);
        assert_eq!((lines.len(), lines[0].as_str(), lines[13].as_str()), (14, "error number 27", "error number 40"));
    }

    #[test]
    fn only_unresolved_review_threads_are_listed() {
        let d = json!([
            { "notes": [{ "id": 1, "system": true, "body": "assigned" }] },
            { "notes": [{ "id": 2, "resolvable": true, "resolved": false, "body": "Rename this", "author": { "name": "Rev", "username": "rev" },
                          "position": { "new_path": "src/a.rs", "new_line": 12 } }, { "id": 3, "resolvable": true, "resolved": false, "body": "why?" }] },
            { "notes": [{ "id": 4, "resolvable": true, "resolved": true, "body": "done" }] },
            { "notes": [{ "id": 5, "resolvable": false, "body": "just a comment" }] }
        ]);
        let (open, resolved) = parse_threads(&d);
        assert_eq!(resolved, 1);
        assert_eq!(open.len(), 1);
        assert_eq!((open[0].note_id, open[0].author.as_str(), open[0].file.as_deref(), open[0].line, open[0].replies), (2, "Rev", Some("src/a.rs"), Some(12), 1));
    }
}
