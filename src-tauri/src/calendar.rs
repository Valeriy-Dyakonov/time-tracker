//! Exchange (on-premises) calendar via EWS `FindItem` + `CalendarView`. Read-only.
//! The server expands recurring meetings itself, so every occurrence arrives as its own item.
use crate::util::{trim_url, truncate};
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
    /// Looks like a call (Teams/Zoom/Telemost link or "созвон" in title/location).
    pub is_call: bool,
    pub tentative: bool,
}

/// Accepts either the mailbox address (https://mail.company.ru) or the full EWS URL.
fn endpoint(url: &str) -> String {
    let u = trim_url(url);
    if u.to_lowercase().contains("/ews/") {
        u
    } else {
        format!("{u}/EWS/Exchange.asmx")
    }
}

fn envelope(version: &str, start_iso: &str, end_iso: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  <soap:Header><t:RequestServerVersion Version="{version}"/></soap:Header>
  <soap:Body>
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>Default</t:BaseShape>
        <t:AdditionalProperties>
          <t:FieldURI FieldURI="item:Subject"/>
          <t:FieldURI FieldURI="calendar:Start"/>
          <t:FieldURI FieldURI="calendar:End"/>
          <t:FieldURI FieldURI="calendar:Location"/>
          <t:FieldURI FieldURI="calendar:IsAllDayEvent"/>
          <t:FieldURI FieldURI="calendar:LegacyFreeBusyStatus"/>
          <t:FieldURI FieldURI="calendar:Organizer"/>
          <t:FieldURI FieldURI="calendar:MyResponseType"/>
          <t:FieldURI FieldURI="calendar:IsCancelled"/>
        </t:AdditionalProperties>
      </m:ItemShape>
      <m:CalendarView MaxEntriesReturned="1000" StartDate="{start_iso}" EndDate="{end_iso}"/>
      <m:ParentFolderIds><t:DistinguishedFolderId Id="calendar"/></m:ParentFolderIds>
    </m:FindItem>
  </soap:Body>
</soap:Envelope>"#
    )
}

fn child_text<'a>(n: roxmltree::Node<'a, '_>, name: &str) -> &'a str {
    n.children()
        .find(|c| c.is_element() && c.tag_name().name() == name)
        .and_then(|c| c.text())
        .unwrap_or("")
}

fn looks_like_call(s: &str) -> bool {
    let s = s.to_lowercase();
    [
        "teams", "zoom", "телемост", "telemost", "skype", "webex", "jitsi", "google meet", "meet.google",
        "bigbluebutton", "созвон", "звонок", "call", "толк", "talk",
    ]
    .iter()
    .any(|k| s.contains(k))
}

/// Parses a FindItem response. `Ok(None)` means "server rejected the requested version".
fn parse(
    xml: &str,
    start_ms: i64,
    end_ms: i64,
    only_calls: bool,
) -> Result<Option<Vec<Meeting>>, String> {
    let doc = roxmltree::Document::parse(xml).map_err(|_| {
        "Exchange вернул не XML — похоже, это страница входа. Проверьте адрес и логин/пароль.".to_string()
    })?;
    let mut out = vec![];
    for msg in doc.descendants().filter(|n| n.tag_name().name() == "FindItemResponseMessage") {
        let code = child_text(msg, "ResponseCode");
        if code == "ErrorInvalidServerVersion" {
            return Ok(None);
        }
        if code != "NoError" {
            return Err(format!("Exchange: {code}: {}", truncate(child_text(msg, "MessageText"), 200)));
        }
    }
    for it in doc.descendants().filter(|n| n.tag_name().name() == "CalendarItem") {
        let subj = child_text(it, "Subject");
        let subj_l = subj.to_lowercase();
        let cancelled_title = ["canceled:", "cancelled:", "отменено:", "отменена:"].iter().any(|p| subj_l.starts_with(p));
        if child_text(it, "IsAllDayEvent") == "true" || child_text(it, "IsCancelled") == "true" || cancelled_title {
            continue;
        }
        let resp = child_text(it, "MyResponseType");
        let busy = child_text(it, "LegacyFreeBusyStatus");
        if resp == "Decline" || busy == "Free" || busy == "OOF" {
            continue;
        }
        let parse_t = |s: &str| DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp_millis());
        let (Some(ts), Some(end)) = (parse_t(child_text(it, "Start")), parse_t(child_text(it, "End"))) else {
            continue;
        };
        let minutes = (end - ts) / 60_000;
        if minutes <= 0 || minutes >= 600 || ts < start_ms || ts >= end_ms {
            continue; // blockers longer than 10 h are not meetings; overlap from the previous period is skipped
        }
        let title = child_text(it, "Subject");
        let location = child_text(it, "Location");
        let organizer = it
            .children()
            .find(|c| c.tag_name().name() == "Organizer")
            .and_then(|o| o.descendants().find(|d| d.tag_name().name() == "Name"))
            .and_then(|n| n.text())
            .unwrap_or("");
        let is_call = looks_like_call(title) || looks_like_call(location);
        if only_calls && !is_call {
            continue;
        }
        out.push(Meeting {
            ts,
            end_ts: end,
            minutes,
            title: truncate(if title.is_empty() { "(без темы)" } else { title }, 120),
            organizer: truncate(organizer, 60),
            location: truncate(location, 80),
            is_call,
            tentative: resp == "Tentative" || busy == "Tentative",
        });
    }
    out.sort_by_key(|m| m.ts);
    Ok(Some(out))
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
    let iso = |ms: i64| {
        DateTime::from_timestamp_millis(ms)
            .map(|d| d.to_rfc3339_opts(SecondsFormat::Secs, true))
            .unwrap_or_default()
    };
    let ep = endpoint(url);

    for version in ["Exchange2013", "Exchange2010_SP2"] {
        let resp = client
            .post(&ep)
            .basic_auth(user.trim(), Some(password))
            .header("Content-Type", "text/xml; charset=utf-8")
            .body(envelope(version, &iso(start_ms), &iso(end_ms)))
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
        if let Some(list) = parse(&text, start_ms, end_ms, only_calls)? {
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
