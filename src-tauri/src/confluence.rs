//! Confluence Server / Data Center, REST API, Personal Access Token. Read-only (GET).
//! Collects pages/comments the user created or edited, as extra context.
use crate::settings::Event;
use crate::util::{parse_jira_time, trim_url, truncate};
use serde::Serialize;
use serde_json::Value;

struct Me {
    username: String,
    key: String,
    display: String,
}

async fn get_json(
    client: &reqwest::Client,
    url: &str,
    pat: &str,
    query: &[(&str, String)],
) -> Result<Value, String> {
    let resp = client
        .get(url)
        .bearer_auth(pat)
        .header("Accept", "application/json")
        .query(query)
        .send()
        .await
        .map_err(|e| format!("Confluence: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Confluence HTTP {status}: {}", truncate(&text, 300)));
    }
    serde_json::from_str(&text).map_err(|e| format!("Confluence JSON: {e}"))
}

async fn myself(client: &reqwest::Client, base: &str, pat: &str) -> Result<Me, String> {
    let v = get_json(client, &format!("{base}/rest/api/user/current"), pat, &[]).await?;
    let s = |k: &str| v[k].as_str().unwrap_or("").to_string();
    Ok(Me { username: s("username"), key: s("userKey"), display: s("displayName") })
}

pub async fn test(client: &reqwest::Client, base: &str, pat: &str) -> Result<String, String> {
    let me = myself(client, &trim_url(base), pat).await?;
    Ok(format!("OK: {}", me.display))
}

fn is_me(u: &Value, me: &Me) -> bool {
    let name = u["username"].as_str().unwrap_or("");
    let key = u["userKey"].as_str().unwrap_or("");
    (!me.username.is_empty() && name == me.username) || (!me.key.is_empty() && key == me.key)
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

pub async fn fetch(
    client: &reqwest::Client,
    base: &str,
    pat: &str,
    start_day: &str,
    start_ms: i64,
    end_ms: i64,
) -> Result<Vec<Event>, String> {
    let base = trim_url(base);
    let me = myself(client, &base, pat).await?;
    let cql = format!(
        "(creator = currentUser() AND created >= \"{start_day}\") \
         OR (contributor = currentUser() AND lastmodified >= \"{start_day}\")"
    );
    let in_range = |ts: i64| ts >= start_ms && ts < end_ms;

    let mut events = vec![];
    let mut start = 0usize;
    let limit = 50usize;
    loop {
        let v = get_json(
            client,
            &format!("{base}/rest/api/content/search"),
            pat,
            &[
                ("cql", cql.clone()),
                ("expand", "version,space,history,container,body.storage".into()),
                ("limit", limit.to_string()),
                ("start", start.to_string()),
            ],
        )
        .await?;
        let results = v["results"].as_array().cloned().unwrap_or_default();

        for r in &results {
            let is_comment = r["type"] == "comment";
            let title = if is_comment {
                r["container"]["title"].as_str().unwrap_or("")
            } else {
                r["title"].as_str().unwrap_or("")
            };
            let space = r["space"]["name"]
                .as_str()
                .or_else(|| r["container"]["space"]["name"].as_str())
                .unwrap_or("");
            let what = if is_comment { "комментарий к странице" } else { "страницу" };
            let excerpt = r["body"]["storage"]["value"].as_str().map(|h| plain(h, 300)).unwrap_or_default();
            let excerpt = if excerpt.is_empty() { String::new() } else { format!(": {excerpt}") };

            let created = r["history"]["createdDate"].as_str().and_then(parse_jira_time);
            let created_by_me = is_me(&r["history"]["createdBy"], &me);
            let mut created_event = false;
            if let (Some(ts), true) = (created, created_by_me) {
                if in_range(ts) {
                    created_event = true;
                    events.push(Event {
                        source: "confluence".into(),
                        ts,
                        issue_key: None,
                        text: format!("Создал {what} «{title}» [{space}]{excerpt}"),
                        context: Some(title.to_string()),
                        weight: 1.0,
                    });
                }
            }

            let ver = &r["version"];
            let edited = ver["when"].as_str().and_then(parse_jira_time);
            if let (Some(ts), true) = (edited, is_me(&ver["by"], &me)) {
                // version 1 is the creation itself
                let first = ver["number"].as_i64().unwrap_or(1) <= 1;
                if in_range(ts) && !(first && created_event) {
                    events.push(Event {
                        source: "confluence".into(),
                        ts,
                        issue_key: None,
                        text: format!("Отредактировал {what} «{title}» [{space}]{excerpt}"),
                        context: Some(title.to_string()),
                        weight: 1.0,
                    });
                }
            }
        }

        start += results.len();
        if results.len() < limit || start >= 500 {
            break;
        }
    }
    Ok(events)
}

/// A page related to a Jira task: read as context for the AI only.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageCtx {
    pub url: String,
    pub title: String,
    pub excerpt: String,
    /// Titles of the page's direct child pages (nested pages).
    pub children: Vec<String>,
}

enum PageRef {
    Id(String),
    Title { space: String, title: String },
}

fn digits_after(s: &str, marker: &str) -> Option<String> {
    let i = s.find(marker)? + marker.len();
    let d: String = s[i..].chars().take_while(|c| c.is_ascii_digit()).collect();
    (!d.is_empty()).then_some(d)
}

/// Recognises `viewpage.action?pageId=N`, `/pages/N/...` and `/display/SPACE/Title` on this Confluence only.
fn parse_ref(base: &str, url: &str) -> Option<PageRef> {
    if !url.starts_with(base) {
        return None;
    }
    if let Some(id) = digits_after(url, "pageId=").or_else(|| digits_after(url, "/pages/")) {
        return Some(PageRef::Id(id));
    }
    let rest = url[base.len()..].strip_prefix("/display/")?;
    let rest = rest.split(['?', '#']).next()?;
    let (space, title) = rest.split_once('/')?;
    let title = urlencoding::decode(&title.replace('+', " ")).ok()?.into_owned();
    Some(PageRef::Title { space: space.to_string(), title })
}

async fn load_page(client: &reqwest::Client, base: &str, pat: &str, url: &str, r: PageRef) -> Option<PageCtx> {
    let page = match r {
        PageRef::Id(id) => get_json(client, &format!("{base}/rest/api/content/{id}"), pat, &[("expand", "body.storage".into())]).await.ok()?,
        PageRef::Title { space, title } => {
            let v = get_json(
                client,
                &format!("{base}/rest/api/content"),
                pat,
                &[("spaceKey", space), ("title", title), ("expand", "body.storage".into())],
            )
            .await
            .ok()?;
            v["results"].as_array()?.first()?.clone()
        }
    };
    let id = page["id"].as_str()?.to_string();
    let children = get_json(client, &format!("{base}/rest/api/content/{id}/child/page"), pat, &[("limit", "10".into())])
        .await
        .ok()
        .and_then(|v| v["results"].as_array().map(|a| a.iter().filter_map(|c| c["title"].as_str().map(String::from)).collect()))
        .unwrap_or_default();
    Some(PageCtx {
        url: url.to_string(),
        title: page["title"].as_str().unwrap_or("").to_string(),
        excerpt: plain(page["body"]["storage"]["value"].as_str().unwrap_or(""), 600),
        children,
    })
}

/// Reads the Confluence pages among `urls` (other hosts are ignored). At most `limit` pages.
pub async fn pages(client: &reqwest::Client, base: &str, pat: &str, urls: &[String], limit: usize) -> Vec<PageCtx> {
    let base = trim_url(base);
    let mut out: Vec<PageCtx> = vec![];
    for u in urls {
        if out.len() >= limit {
            break;
        }
        let Some(r) = parse_ref(&base, u) else { continue };
        if let Some(p) = load_page(client, &base, pat, u, r).await {
            if !out.iter().any(|x| x.title == p.title) {
                out.push(p);
            }
        }
    }
    out
}
