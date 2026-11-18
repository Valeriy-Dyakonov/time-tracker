//! The user's own worklogs. Read for the "Списание" tab; written only on an explicit action there.
//! Tempo on Jira Server/DC keeps its worklogs in Jira, so the standard worklog API covers both.
//! `adjustEstimate=leave`: booking time never changes the task's remaining estimate.
use super::Jira;
use crate::error::{AppError, AppResult};
use crate::util::parse_jira_time;
use chrono::{Local, NaiveDate, TimeZone};
use reqwest::Method;
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worklog {
    pub id: String,
    pub key: String,
    /// Local date the work was started (YYYY-MM-DD).
    pub date: String,
    pub seconds: i64,
    pub comment: String,
}

const LEAVE: (&str, &str) = ("adjustEstimate", "leave");
/// New worklogs start at 09:00 local time: Tempo shows them on that day.
const START_HOUR: u32 = 9;

fn date(s: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| AppError::service("date", e))
}

fn local_date(ms: i64) -> Option<String> {
    Local.timestamp_millis_opt(ms).single().map(|d| d.format("%Y-%m-%d").to_string())
}

/// `2026-11-10T09:00:00.000+0300`, the format Jira Server accepts for `started`.
fn started(day: &str) -> AppResult<String> {
    let at = date(day)?.and_hms_opt(START_HOUR, 0, 0).unwrap();
    Local
        .from_local_datetime(&at)
        .earliest()
        .map(|d| d.format("%Y-%m-%dT%H:%M:%S%.3f%z").to_string())
        .ok_or_else(|| AppError::raw("bad local time"))
}

fn worklog(key: &str, w: &Value) -> Option<Worklog> {
    let ms = w["started"].as_str().and_then(parse_jira_time)?;
    Some(Worklog {
        id: w["id"].as_str().map(String::from).or_else(|| w["id"].as_i64().map(|i| i.to_string()))?,
        key: key.to_string(),
        date: local_date(ms)?,
        seconds: w["timeSpentSeconds"].as_i64().unwrap_or(0),
        comment: w["comment"].as_str().unwrap_or("").to_string(),
    })
}

fn check_seconds(seconds: i64) -> AppResult<()> {
    if seconds <= 0 || seconds > 24 * 3600 {
        return Err(AppError::new("worklogBadTime").with("seconds", seconds.to_string()));
    }
    Ok(())
}

impl Jira<'_> {
    async fn send(&self, method: Method, path: &str, query: &[(&str, String)], body: Option<&Value>) -> AppResult<Value> {
        self.api.send(method, &format!("{}{path}", self.base), query, body).await
    }

    /// Keys of issues with the user's worklogs in [start, end].
    async fn worklog_keys(&self, start: &str, end: &str) -> AppResult<Vec<String>> {
        let jql = format!("worklogAuthor = currentUser() AND worklogDate >= \"{start}\" AND worklogDate <= \"{end}\"");
        let mut keys = vec![];
        loop {
            let v = self
                .get(
                    "/rest/api/2/search",
                    &[("jql", jql.clone()), ("fields", "key".into()), ("startAt", keys.len().to_string()), ("maxResults", "100".into())],
                )
                .await?;
            let page: Vec<String> = v["issues"].as_array().into_iter().flatten().filter_map(|i| i["key"].as_str().map(String::from)).collect();
            let total = v["total"].as_u64().unwrap_or(0) as usize;
            let empty = page.is_empty();
            keys.extend(page);
            if empty || keys.len() >= total || keys.len() >= 1000 {
                return Ok(keys);
            }
        }
    }

    async fn issue_worklogs(&self, key: &str) -> AppResult<Vec<Value>> {
        let mut out = vec![];
        loop {
            let v = self
                .get(&format!("/rest/api/2/issue/{key}/worklog"), &[("startAt", out.len().to_string()), ("maxResults", "1000".into())])
                .await?;
            let page = v["worklogs"].as_array().cloned().unwrap_or_default();
            let total = v["total"].as_u64().unwrap_or(0) as usize;
            let empty = page.is_empty();
            out.extend(page);
            if empty || out.len() >= total {
                return Ok(out);
            }
        }
    }
}

/// The user's worklogs dated within [start, end] (local dates, inclusive).
pub async fn mine(client: &reqwest::Client, base: &str, pat: &str, start: &str, end: &str) -> AppResult<Vec<Worklog>> {
    let (from, to) = (date(start)?, date(end)?);
    let jira = Jira::new(client, base, pat);
    let me = jira.myself().await?;
    let mut out = vec![];
    for key in jira.worklog_keys(&from.to_string(), &to.to_string()).await? {
        for w in jira.issue_worklogs(&key).await? {
            if !me.is(&w["author"]) {
                continue;
            }
            if let Some(wl) = worklog(&key, &w).filter(|wl| wl.date >= from.to_string() && wl.date <= to.to_string()) {
                out.push(wl);
            }
        }
    }
    Ok(out)
}

pub async fn add(client: &reqwest::Client, base: &str, pat: &str, key: &str, day: &str, seconds: i64, comment: &str) -> AppResult<Worklog> {
    check_seconds(seconds)?;
    let body = json!({ "started": started(day)?, "timeSpentSeconds": seconds, "comment": comment });
    let v = Jira::new(client, base, pat)
        .send(Method::POST, &format!("/rest/api/2/issue/{key}/worklog"), &[(LEAVE.0, LEAVE.1.into())], Some(&body))
        .await?;
    worklog(key, &v).ok_or_else(|| AppError::service("Jira", "worklog"))
}

pub async fn update(client: &reqwest::Client, base: &str, pat: &str, key: &str, id: &str, seconds: i64, comment: &str) -> AppResult<Worklog> {
    check_seconds(seconds)?;
    let body = json!({ "timeSpentSeconds": seconds, "comment": comment });
    let v = Jira::new(client, base, pat)
        .send(Method::PUT, &format!("/rest/api/2/issue/{key}/worklog/{id}"), &[(LEAVE.0, LEAVE.1.into())], Some(&body))
        .await?;
    worklog(key, &v).ok_or_else(|| AppError::service("Jira", "worklog"))
}

pub async fn delete(client: &reqwest::Client, base: &str, pat: &str, key: &str, id: &str) -> AppResult<()> {
    Jira::new(client, base, pat)
        .send(Method::DELETE, &format!("/rest/api/2/issue/{key}/worklog/{id}"), &[(LEAVE.0, LEAVE.1.into())], None)
        .await
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_worklog_and_formats_started() {
        let w = json!({ "id": "10101", "started": "2026-11-10T09:00:00.000+0000", "timeSpentSeconds": 5400, "comment": "Fixed import" });
        let wl = worklog("A-1", &w).unwrap();
        assert_eq!((wl.id.as_str(), wl.seconds, wl.comment.as_str()), ("10101", 5400, "Fixed import"));
        let s = started("2026-11-10").unwrap();
        assert!(s.starts_with("2026-11-10T09:00:00.000"), "{s}");
        assert!(started("10.11.2026").is_err());
    }

    #[test]
    fn rejects_empty_or_huge_time() {
        assert!(check_seconds(0).is_err());
        assert!(check_seconds(25 * 3600).is_err());
        assert!(check_seconds(3600).is_ok());
    }
}
