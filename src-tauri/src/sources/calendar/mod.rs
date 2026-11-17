//! Exchange (on-premises) calendar via EWS FindItem + CalendarView. Read-only.
//! The server expands recurring meetings itself, so every occurrence arrives as its own item.
mod ews;

use crate::util::truncate;
use chrono::{DateTime, SecondsFormat};
use serde::Serialize;

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
    start_ms: i64,
    end_ms: i64,
    only_calls: bool,
) -> Result<Vec<Meeting>, String> {
    if url.trim().is_empty() || user.trim().is_empty() {
        return Err("Exchange: укажите адрес почты и логин в настройках".into());
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
            .map_err(|e| format!("Exchange: {e}"))?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if status.as_u16() == 401 {
            return Err("Exchange: 401 — логин или пароль не приняты. Формат логина: ДОМЕН\\логин или логин@компания.ru. \
                        Если пароль точно верный, возможно сервер требует NTLM/Kerberos вместо Basic — напишите об этом, добавим."
                .into());
        }
        if !status.is_success() && !text.contains("FindItemResponse") {
            return Err(format!("Exchange HTTP {status}: {}", truncate(&text, 160)));
        }
        if let Some(list) = ews::parse(&text, start_ms, end_ms, only_calls)? {
            return Ok(list);
        }
    }
    Err("Exchange: сервер не поддерживает запрошенную версию протокола".into())
}

pub async fn test(client: &reqwest::Client, url: &str, user: &str, password: &str) -> Result<String, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let day = 86_400_000;
    let list = fetch(client, url, user, password, now - day, now + day, false).await?;
    Ok(format!("OK: подключено, встреч в ближайшие сутки (±1 день): {}", list.len()))
}
