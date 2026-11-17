//! Exchange (on-premises) calendar via EWS FindItem + CalendarView. Read-only.
//! The server expands recurring meetings itself, so every occurrence arrives as its own item.
mod ews;

use crate::texts::Lang;
use crate::util::truncate;
use chrono::{DateTime, SecondsFormat};
use serde::Serialize;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Meeting {
    pub ts: i64,
    pub end_ts: i64,
    pub minutes: i64,
    pub title: String,
    pub organizer: String,
    pub location: String,
    /// Teams/Zoom/Telemost link or "созвон" in title/location.
    pub is_call: bool,
    pub tentative: bool,
}

const VERSIONS: [&str; 2] = ["Exchange2013", "Exchange2010_SP2"];

fn iso(ms: i64) -> String {
    DateTime::from_timestamp_millis(ms).map(|d| d.to_rfc3339_opts(SecondsFormat::Secs, true)).unwrap_or_default()
}

pub async fn fetch(
    client: &reqwest::Client,
    url: &str,
    user: &str,
    password: &str,
    (start_ms, end_ms): (i64, i64),
    only_calls: bool,
    lang: Lang,
) -> AppResult<Vec<Meeting>> {
    if url.trim().is_empty() || user.trim().is_empty() {
        return Err(AppError::new("exchangeNotConfigured"));
    }
    let endpoint = ews::endpoint(url);
    for version in VERSIONS {
        let resp = client
            .post(&endpoint)
            .basic_auth(user.trim(), Some(password))
            .header("Content-Type", "text/xml; charset=utf-8")
            .body(ews::envelope(version, &iso(start_ms), &iso(end_ms)))
            .send()
            .await
            .map_err(|e| AppError::service("Exchange", e))?;
        let status = resp.status();
        let text = resp.text().await.map_err(AppError::raw)?;
        if status.as_u16() == 401 {
            return Err(AppError::new("exchangeUnauthorized"));
        }
        if !status.is_success() && !text.contains("FindItemResponse") {
            return Err(AppError::http("Exchange", status, &truncate(&text, 160)));
        }
        if let Some(list) = ews::parse(&text, start_ms, end_ms, only_calls, lang)? {
            return Ok(list);
        }
    }
    Err(AppError::new("exchangeVersion"))
}

/// Number of meetings within ±1 day of now.
pub async fn test(client: &reqwest::Client, url: &str, user: &str, password: &str) -> AppResult<usize> {
    let now = chrono::Utc::now().timestamp_millis();
    let day = 86_400_000;
    Ok(fetch(client, url, user, password, (now - day, now + day), false, Lang::default()).await?.len())
}
