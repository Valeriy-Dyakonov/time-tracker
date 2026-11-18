//! Confluence pages linked from Jira tasks, read as context for the AI only.
use super::{plain, Confluence};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageCtx {
    pub url: String,
    pub title: String,
    pub excerpt: String,
    /// Titles of direct child pages.
    pub children: Vec<String>,
}

#[derive(Debug, PartialEq)]
pub(super) enum PageRef {
    Id(String),
    Title { space: String, title: String },
}

fn digits_after(s: &str, marker: &str) -> Option<String> {
    let i = s.find(marker)? + marker.len();
    let d: String = s[i..].chars().take_while(|c| c.is_ascii_digit()).collect();
    (!d.is_empty()).then_some(d)
}

/// `viewpage.action?pageId=N`, `/pages/N/...` and `/display/SPACE/Title`, on this Confluence only.
pub(super) fn parse_ref(base: &str, url: &str) -> Option<PageRef> {
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

async fn load(wiki: &Confluence<'_>, url: &str, r: PageRef) -> Option<PageCtx> {
    let body = ("expand", "body.storage".to_string());
    let page = match r {
        PageRef::Id(id) => wiki.get(&format!("/rest/api/content/{id}"), &[body]).await.ok()?,
        PageRef::Title { space, title } => {
            let v = wiki.get("/rest/api/content", &[("spaceKey", space), ("title", title), body]).await.ok()?;
            v["results"].as_array()?.first()?.clone()
        }
    };
    let id = page["id"].as_str()?;
    let children = wiki
        .get(&format!("/rest/api/content/{id}/child/page"), &[("limit", "10".into())])
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

/// Reads the Confluence pages among `urls`, at most `limit`; other hosts are ignored.
pub async fn pages(client: &reqwest::Client, base: &str, pat: &str, urls: &[String], limit: usize) -> Vec<PageCtx> {
    let wiki = Confluence::new(client, base, pat);
    let mut out: Vec<PageCtx> = vec![];
    for u in urls {
        if out.len() >= limit {
            break;
        }
        let Some(r) = parse_ref(&wiki.base, u) else { continue };
        if let Some(p) = load(&wiki, u, r).await {
            if !out.iter().any(|x| x.title == p.title) {
                out.push(p);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_page_links_of_this_confluence_only() {
        let base = "https://wiki.co";
        assert_eq!(parse_ref(base, "https://wiki.co/pages/viewpage.action?pageId=42"), Some(PageRef::Id("42".into())));
        assert_eq!(parse_ref(base, "https://wiki.co/spaces/X/pages/7/Title"), Some(PageRef::Id("7".into())));
        assert_eq!(
            parse_ref(base, "https://wiki.co/display/DEV/Release+notes?x=1"),
            Some(PageRef::Title { space: "DEV".into(), title: "Release notes".into() })
        );
        assert_eq!(parse_ref(base, "https://other.co/pages/viewpage.action?pageId=42"), None);
    }
}
