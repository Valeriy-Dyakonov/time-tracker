//! Jira JSON -> issues and the user's own events.
use crate::texts::Lang;
use crate::model::{Event, IssueInfo, StatusChange};
use crate::util::{parse_jira_time, truncate};
use serde_json::Value;

pub struct Me {
    pub name: String,
    pub key: String,
    pub display: String,
}

impl Me {
    pub fn from_json(v: &Value) -> Self {
        let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
        Self { name: s("name"), key: s("key"), display: s("displayName") }
    }

    fn is(&self, user: &Value) -> bool {
        let name = user["name"].as_str().unwrap_or("");
        let key = user["key"].as_str().unwrap_or("");
        (!self.name.is_empty() && name == self.name) || (!self.key.is_empty() && key == self.key)
    }
}

pub fn issue_fields(epic: &Option<String>) -> String {
    let mut f = String::from("summary,status,issuetype,description,parent,issuelinks,created,resolutiondate,assignee");
    if let Some(e) = epic {
        f.push(',');
        f.push_str(e);
    }
    f
}

/// http(s) links from a description: wiki markup `[title|url]` and plain URLs.
fn extract_urls(text: &str) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for part in text.split(|c: char| c.is_whitespace() || "[]|()<>\"'".contains(c)) {
        if part.starts_with("http://") || part.starts_with("https://") {
            let u = part.trim_end_matches(|c: char| ".,;!?".contains(c)).to_string();
            if !out.contains(&u) {
                out.push(u);
            }
        }
    }
    out.truncate(10);
    out
}

pub fn issue(it: &Value, epic: &Option<String>) -> IssueInfo {
    let f = &it["fields"];
    let links = f["issuelinks"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|l| ["outwardIssue", "inwardIssue"].map(|side| l[side]["key"].as_str().map(String::from)))
        .flatten()
        .collect();
    let description = f["description"].as_str().unwrap_or("");
    IssueInfo {
        key: it["key"].as_str().unwrap_or("").to_string(),
        summary: f["summary"].as_str().unwrap_or("").to_string(),
        status: f["status"]["name"].as_str().unwrap_or("").to_string(),
        issue_type: f["issuetype"]["name"].as_str().unwrap_or("").to_string(),
        description: truncate(description, 500),
        urls: extract_urls(description),
        parent: f["parent"]["key"].as_str().map(String::from),
        epic: epic.as_ref().and_then(|e| f[e.as_str()].as_str()).map(String::from),
        links,
        transitions: vec![],
        created: f["created"].as_str().and_then(parse_jira_time),
        resolved: f["resolutiondate"].as_str().and_then(parse_jira_time),
        assigned_to_me: false,
    }
}

/// Current assignee, or an assignee change from/to the user in the history (a task handed over to QA still counts).
pub fn assigned_to_me(it: &Value, me: &Me) -> bool {
    if me.is(&it["fields"]["assignee"]) {
        return true;
    }
    let is_me = |v: &Value| v.as_str().is_some_and(|s| !s.is_empty() && (s == me.name || s == me.key));
    it["changelog"]["histories"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|h| h["items"].as_array().into_iter().flatten())
        .any(|i| i["field"].as_str() == Some("assignee") && (is_me(&i["from"]) || is_me(&i["to"])))
}

/// Status history by anyone: needed to tell "in development" from "in testing".
pub fn transitions(it: &Value, me: &Me) -> Vec<StatusChange> {
    let mut out = vec![];
    for h in it["changelog"]["histories"].as_array().into_iter().flatten() {
        let Some(ts) = h["created"].as_str().and_then(parse_jira_time) else { continue };
        for i in h["items"].as_array().into_iter().flatten() {
            if i["field"].as_str() == Some("status") {
                out.push(StatusChange {
                    ts,
                    from: i["fromString"].as_str().unwrap_or("").to_string(),
                    to: i["toString"].as_str().unwrap_or("").to_string(),
                    by_me: me.is(&h["author"]),
                });
            }
        }
    }
    out.sort_by_key(|t| t.ts);
    out
}

/// What the user did with the issue in [start_ms, end_ms): created it, changed fields, commented.
pub fn my_events(it: &Value, me: &Me, start_ms: i64, end_ms: i64, lang: Lang) -> Vec<Event> {
    let key = it["key"].as_str().unwrap_or("").to_string();
    let f = &it["fields"];
    let in_range = |ts: i64| ts >= start_ms && ts < end_ms;
    let event = |ts: i64, kind: &str, text: String| Event { issue_key: Some(key.clone()), kind: Some(kind.into()), ..Event::new("jira", ts, text) };
    let mut out = vec![];

    if me.is(&f["reporter"]) {
        if let Some(ts) = f["created"].as_str().and_then(parse_jira_time).filter(|t| in_range(*t)) {
            let summary = f["summary"].as_str().unwrap_or("");
            out.push(event(ts, "created", lang.jira_created(&truncate(summary, 120))));
        }
    }

    for h in it["changelog"]["histories"].as_array().into_iter().flatten() {
        if !me.is(&h["author"]) {
            continue;
        }
        let Some(ts) = h["created"].as_str().and_then(parse_jira_time).filter(|t| in_range(*t)) else { continue };
        let items: Vec<String> = h["items"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|i| {
                format!(
                    "{}: {} → {}",
                    i["field"].as_str().unwrap_or("?"),
                    i["fromString"].as_str().unwrap_or("∅"),
                    truncate(i["toString"].as_str().unwrap_or("∅"), 60)
                )
            })
            .collect();
        if !items.is_empty() {
            out.push(event(ts, "changed", items.join("; ")));
        }
    }

    for c in f["comment"]["comments"].as_array().into_iter().flatten() {
        if !me.is(&c["author"]) {
            continue;
        }
        let Some(ts) = c["created"].as_str().and_then(parse_jira_time).filter(|t| in_range(*t)) else { continue };
        out.push(event(ts, "comment", lang.jira_comment(&truncate(c["body"].as_str().unwrap_or(""), 300))));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_unique_links_from_wiki_markup() {
        let urls = extract_urls("см. [спека|https://wiki/x?pageId=1] и https://wiki/x?pageId=1. ещё (https://a.b/c),");
        assert_eq!(urls, vec!["https://wiki/x?pageId=1", "https://a.b/c"]);
    }

    #[test]
    fn keeps_only_my_events_inside_the_period() {
        let me = Me { name: "me".into(), key: "".into(), display: "Me".into() };
        let it = json!({
            "key": "A-1",
            "fields": {
                "summary": "Task",
                "reporter": { "name": "me" },
                "created": "2026-11-10T10:00:00.000+0000",
                "comment": { "comments": [
                    { "author": { "name": "other" }, "created": "2026-11-10T11:00:00.000+0000", "body": "x" },
                    { "author": { "name": "me" }, "created": "2026-11-10T12:00:00.000+0000", "body": "done" }
                ]}
            },
            "changelog": { "histories": [] }
        });
        let start = parse_jira_time("2026-11-10T00:00:00.000+0000").unwrap();
        let events = my_events(&it, &me, start, start + 86_400_000, Lang::Ru);
        let texts: Vec<&str> = events.iter().map(|e| e.text.as_str()).collect();
        assert_eq!(texts, vec!["Создал задачу: Task", "Комментарий: done"]);
        assert!(events.iter().all(|e| e.issue_key.as_deref() == Some("A-1")));
    }

    #[test]
    fn assignee_now_or_in_history() {
        let me = Me { name: "me".into(), key: "JIRAUSER1".into(), display: "Me".into() };
        let now = json!({ "fields": { "assignee": { "name": "me" } } });
        let before = json!({
            "fields": { "assignee": { "name": "qa" } },
            "changelog": { "histories": [{ "items": [{ "field": "assignee", "from": "JIRAUSER1", "to": "qa" }] }] }
        });
        let never = json!({
            "fields": { "assignee": { "name": "qa" }, "reporter": { "name": "me" } },
            "changelog": { "histories": [{ "items": [{ "field": "assignee", "from": "dev", "to": "qa" }] }] }
        });
        let unassigned = json!({ "fields": { "assignee": null } });
        assert!(assigned_to_me(&now, &me));
        assert!(assigned_to_me(&before, &me));
        assert!(!assigned_to_me(&never, &me));
        assert!(!assigned_to_me(&unassigned, &me));
    }
}
