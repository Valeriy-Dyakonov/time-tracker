//! Confluence Server / Data Center, REST API, Personal Access Token. Read-only.
//! Pages and comments the user created or edited are extra context for the day.
mod pages;

pub use pages::{pages, PageCtx};

use crate::http::{Auth, JsonApi};
use crate::model::Event;
use crate::util::{parse_jira_time, trim_url, truncate};
use serde_json::Value;
use crate::texts::Lang;
use crate::error::AppResult;

struct Me {
    username: String,
    key: String,
    display: String,
}

impl Me {
    fn is(&self, u: &Value) -> bool {
        let name = u["username"].as_str().unwrap_or("");
        let key = u["userKey"].as_str().unwrap_or("");
        (!self.username.is_empty() && name == self.username) || (!self.key.is_empty() && key == self.key)
    }
}

struct Confluence<'a> {
    api: JsonApi<'a>,
    base: String,
}

impl<'a> Confluence<'a> {
    fn new(client: &'a reqwest::Client, base: &str, pat: &'a str) -> Self {
        Self { api: JsonApi::new(client, "Confluence", Auth::Bearer(pat)), base: trim_url(base) }
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> AppResult<Value> {
        self.api.get(&format!("{}{path}", self.base), query).await
    }

    async fn myself(&self) -> AppResult<Me> {
        let v = self.get("/rest/api/user/current", &[]).await?;
        let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
        Ok(Me { username: s("username"), key: s("userKey"), display: s("displayName") })
    }
}

/// Storage-format HTML -> short plain text.
fn plain(html: &str, max: usize) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let out = out
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"");
    truncate(&out.split_whitespace().collect::<Vec<_>>().join(" "), max)
}

/// Display name of the token owner.
pub async fn test(client: &reqwest::Client, base: &str, pat: &str) -> AppResult<String> {
    Ok(Confluence::new(client, base, pat).myself().await?.display)
}

fn content_events(r: &Value, me: &Me, in_range: impl Fn(i64) -> bool, lang: Lang) -> Vec<Event> {
    let is_comment = r["type"] == "comment";
    let title = if is_comment { r["container"]["title"].as_str() } else { r["title"].as_str() }.unwrap_or("");
    let space = r["space"]["name"].as_str().or_else(|| r["container"]["space"]["name"].as_str()).unwrap_or("");
    let excerpt = r["body"]["storage"]["value"].as_str().map(|h| plain(h, 300)).unwrap_or_default();
    let excerpt = if excerpt.is_empty() { String::new() } else { format!(": {excerpt}") };
    let event = |ts: i64, edited: bool| Event {
        context: Some(title.to_string()),
        ..Event::new("confluence", ts, format!("{} [{space}]{excerpt}", lang.confluence(edited, is_comment, title)))
    };

    let mut out = vec![];
    let created = r["history"]["createdDate"].as_str().and_then(parse_jira_time).filter(|t| in_range(*t));
    let created_by_me = created.is_some() && me.is(&r["history"]["createdBy"]);
    if let (Some(ts), true) = (created, created_by_me) {
        out.push(event(ts, false));
    }
    let ver = &r["version"];
    if let Some(ts) = ver["when"].as_str().and_then(parse_jira_time).filter(|t| in_range(*t)) {
        let is_creation = ver["number"].as_i64().unwrap_or(1) <= 1 && created_by_me;
        if me.is(&ver["by"]) && !is_creation {
            out.push(event(ts, true));
        }
    }
    out
}

pub async fn fetch(
    client: &reqwest::Client,
    base: &str,
    pat: &str,
    start_day: &str,
    start_ms: i64,
    end_ms: i64,
    lang: Lang,
) -> AppResult<Vec<Event>> {
    let wiki = Confluence::new(client, base, pat);
    let me = wiki.myself().await?;
    let cql = format!(
        "(creator = currentUser() AND created >= \"{start_day}\") \
         OR (contributor = currentUser() AND lastmodified >= \"{start_day}\")"
    );
    const LIMIT: usize = 50;

    let mut events = vec![];
    let mut start = 0usize;
    loop {
        let v = wiki
            .get(
                "/rest/api/content/search",
                &[
                    ("cql", cql.clone()),
                    ("expand", "version,space,history,container,body.storage".into()),
                    ("limit", LIMIT.to_string()),
                    ("start", start.to_string()),
                ],
            )
            .await?;
        let results = v["results"].as_array().cloned().unwrap_or_default();
        for r in &results {
            events.extend(content_events(r, &me, |ts| ts >= start_ms && ts < end_ms, lang));
        }
        start += results.len();
        if results.len() < LIMIT || start >= 500 {
            break;
        }
    }
    Ok(events)
}
