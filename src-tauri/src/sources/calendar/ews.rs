//! EWS SOAP: the FindItem/CalendarView request and its response.
use super::Meeting;
use crate::util::{trim_url, truncate};
use chrono::DateTime;
use crate::texts::Lang;
use crate::error::{AppError, AppResult};

/// Accepts the mailbox address (https://mail.company.ru) or the full EWS URL.
pub fn endpoint(url: &str) -> String {
    let u = trim_url(url);
    if u.to_lowercase().contains("/ews/") {
        u
    } else {
        format!("{u}/EWS/Exchange.asmx")
    }
}

pub fn envelope(version: &str, start_iso: &str, end_iso: &str) -> String {
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
        "bigbluebutton", "созвон", "звонок", "call", "толк", "talk", "daily", "дейли", "дэйли", "стендап", "standup", "stand-up",
    ]
    .iter()
    .any(|k| s.contains(k))
}

fn is_cancelled(it: roxmltree::Node) -> bool {
    let subject = child_text(it, "Subject").to_lowercase();
    child_text(it, "IsCancelled") == "true"
        || ["canceled:", "cancelled:", "отменено:", "отменена:"].iter().any(|p| subject.starts_with(p))
}

/// A calendar item the user actually attends, or None (all-day, cancelled, declined, free, out of range...).
fn meeting(it: roxmltree::Node, start_ms: i64, end_ms: i64, lang: Lang) -> Option<Meeting> {
    if child_text(it, "IsAllDayEvent") == "true" || is_cancelled(it) {
        return None;
    }
    let resp = child_text(it, "MyResponseType");
    let busy = child_text(it, "LegacyFreeBusyStatus");
    if resp == "Decline" || busy == "Free" || busy == "OOF" {
        return None;
    }
    let time = |s: &str| DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp_millis());
    let ts = time(child_text(it, "Start"))?;
    let end = time(child_text(it, "End"))?;
    let minutes = (end - ts) / 60_000;
    // Blockers longer than 10 h are not meetings; an overlap from the previous period is skipped.
    if minutes <= 0 || minutes >= 600 || ts < start_ms || ts >= end_ms {
        return None;
    }
    let title = child_text(it, "Subject");
    let location = child_text(it, "Location");
    let organizer = it
        .children()
        .find(|c| c.tag_name().name() == "Organizer")
        .and_then(|o| o.descendants().find(|d| d.tag_name().name() == "Name"))
        .and_then(|n| n.text())
        .unwrap_or("");
    Some(Meeting {
        ts,
        end_ts: end,
        minutes,
        title: truncate(if title.is_empty() { lang.no_subject() } else { title }, 120),
        organizer: truncate(organizer, 60),
        location: truncate(location, 80),
        is_call: looks_like_call(title) || looks_like_call(location),
        tentative: resp == "Tentative" || busy == "Tentative",
    })
}

/// `Ok(None)` means the server rejected the requested protocol version.
pub fn parse(xml: &str, start_ms: i64, end_ms: i64, only_calls: bool, lang: Lang) -> AppResult<Option<Vec<Meeting>>> {
    let doc = roxmltree::Document::parse(xml).map_err(|_| AppError::new("exchangeNotXml"))?;
    for msg in doc.descendants().filter(|n| n.tag_name().name() == "FindItemResponseMessage") {
        match child_text(msg, "ResponseCode") {
            "ErrorInvalidServerVersion" => return Ok(None),
            "NoError" => {}
            code => return Err(AppError::service("Exchange", format!("{code}: {}", truncate(child_text(msg, "MessageText"), 200)))),
        }
    }
    let mut out: Vec<Meeting> = doc
        .descendants()
        .filter(|n| n.tag_name().name() == "CalendarItem")
        .filter_map(|it| meeting(it, start_ms, end_ms, lang))
        .filter(|m| !only_calls || m.is_call)
        .collect();
    out.sort_by_key(|m| m.ts);
    Ok(Some(out))
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<Envelope><Body><FindItemResponse><ResponseMessages>
      <FindItemResponseMessage><ResponseCode>NoError</ResponseCode></FindItemResponseMessage>
      <CalendarItem><Subject>Daily в Teams</Subject><Start>2026-11-10T09:00:00Z</Start><End>2026-11-10T09:15:00Z</End></CalendarItem>
      <CalendarItem><Subject>Обед</Subject><Start>2026-11-10T12:00:00Z</Start><End>2026-11-10T13:00:00Z</End><LegacyFreeBusyStatus>Free</LegacyFreeBusyStatus></CalendarItem>
      <CalendarItem><Subject>Canceled: Демо</Subject><Start>2026-11-10T14:00:00Z</Start><End>2026-11-10T15:00:00Z</End></CalendarItem>
      <CalendarItem><Subject>Планирование</Subject><Start>2026-11-10T15:00:00Z</Start><End>2026-11-10T16:00:00Z</End></CalendarItem>
    </ResponseMessages></FindItemResponse></Body></Envelope>"#;

    fn day() -> (i64, i64) {
        let a = DateTime::parse_from_rfc3339("2026-11-10T00:00:00Z").unwrap().timestamp_millis();
        (a, a + 86_400_000)
    }

    #[test]
    fn skips_free_and_cancelled_items() {
        let (a, b) = day();
        let list = parse(XML, a, b, false, Lang::Ru).unwrap().unwrap();
        let titles: Vec<&str> = list.iter().map(|m| m.title.as_str()).collect();
        assert_eq!(titles, vec!["Daily в Teams", "Планирование"]);
        assert!(list[0].is_call && list[0].minutes == 15);
    }

    #[test]
    fn only_calls_keeps_calls() {
        let (a, b) = day();
        assert_eq!(parse(XML, a, b, true, Lang::Ru).unwrap().unwrap().len(), 1);
    }

    #[test]
    fn invalid_version_asks_for_retry() {
        let xml = "<a><FindItemResponseMessage><ResponseCode>ErrorInvalidServerVersion</ResponseCode></FindItemResponseMessage></a>";
        assert!(parse(xml, 0, 1, false, Lang::Ru).unwrap().is_none());
    }
}
