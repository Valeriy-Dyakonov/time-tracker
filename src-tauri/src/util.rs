use chrono::{DateTime, Duration, Local, NaiveDate, TimeZone};
use std::time::Duration as StdDuration;
use crate::error::{AppError, AppResult};

pub fn client(accept_invalid_certs: bool) -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(accept_invalid_certs)
        .timeout(StdDuration::from_secs(120))
        .user_agent("worklog-tracker/0.1")
        .build()
        .map_err(AppError::raw)
}

/// `start`/`end` are inclusive local dates (YYYY-MM-DD).
/// Returns [start_ms, end_ms) in epoch milliseconds.
pub fn range_ms(start: &str, end: &str) -> AppResult<(i64, i64)> {
    let s = NaiveDate::parse_from_str(start, "%Y-%m-%d").map_err(|e| AppError::service("start", e))?;
    let e = NaiveDate::parse_from_str(end, "%Y-%m-%d").map_err(|e| AppError::service("end", e))?;
    let e = e + Duration::days(1);
    let to_ms = |d: NaiveDate| -> AppResult<i64> {
        Local
            .from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap())
            .earliest()
            .map(|dt| dt.timestamp_millis())
            .ok_or_else(|| AppError::raw("bad local time"))
    };
    Ok((to_ms(s)?, to_ms(e)?))
}

/// Jira Server returns `2026-11-10T14:03:22.123+0300`.
pub fn parse_jira_time(s: &str) -> Option<i64> {
    DateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.3f%z")
        .or_else(|_| DateTime::parse_from_rfc3339(s))
        .ok()
        .map(|d| d.timestamp_millis())
}

pub fn truncate(s: &str, max: usize) -> String {
    let s = s.replace('\n', " ");
    if s.chars().count() <= max {
        s
    } else {
        let t: String = s.chars().take(max).collect();
        format!("{t}…")
    }
}

pub fn trim_url(u: &str) -> String {
    u.trim().trim_end_matches('/').to_string()
}
