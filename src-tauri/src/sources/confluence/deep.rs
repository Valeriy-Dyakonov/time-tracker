//! Confluence pages for the dashboard's AI analysis of one task: the pages linked from the task read in full
//! (structure kept as plain text), then one level further: pages they link to and their child pages.
//! Read-only. The worklog keeps using the short excerpts of `pages.rs`.
use super::pages::{parse_ref, PageRef};
use super::Confluence;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;

/// Pages linked from the task, and pages reached from them.
const FIRST: usize = 8;
const NESTED: usize = 4;
const FIRST_TEXT: usize = 3000;
const NESTED_TEXT: usize = 1200;
const CHILDREN: usize = 10;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDoc {
    pub url: String,
    pub title: String,
    /// Plain text with headings, list items and table rows on their own lines.
    pub text: String,
    /// Titles of direct child pages.
    pub children: Vec<String>,
    /// Web links on the page that lead outside Confluence (GitLab, other systems).
    pub links: Vec<String>,
    /// 0: linked from the task; 1: linked from such a page or its child.
    pub depth: u8,
}

/// Value of `name="..."` inside one tag.
fn attr(tag: &str, name: &str) -> Option<String> {
    let i = tag.find(&format!("{name}=\""))? + name.len() + 2;
    let end = tag[i..].find('"')?;
    Some(decode(&tag[i..i + end]))
}

fn decode(s: &str) -> String {
    s.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&")
}

/// Cut to `max` characters, keeping line breaks.
fn cut(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    format!("{}…", s.chars().take(max).collect::<String>())
}

/// Storage-format HTML -> text that keeps the page's shape: headings as `## `, list items as `- `,
/// table cells joined by ` | `, one block per line.
pub fn structured(html: &str) -> String {
    let mut out = String::new();
    let mut rest = html;
    while let Some(i) = rest.find('<') {
        out.push_str(&rest[..i]);
        // Code macros keep their text in CDATA, verbatim: "<" there is not a tag.
        if let Some(body) = rest[i..].strip_prefix("<![CDATA[") {
            let end = body.find("]]>").unwrap_or(body.len());
            out.push_str(&body[..end].replace('&', "&amp;").replace('<', "&lt;"));
            rest = body.get(end + 3..).unwrap_or("");
            continue;
        }
        let Some(j) = rest[i..].find('>') else { break };
        let tag = &rest[i + 1..i + j];
        rest = &rest[i + j + 1..];
        let closing = tag.starts_with('/');
        let name: String = tag.trim_start_matches('/').chars().take_while(|c| c.is_alphanumeric() || *c == ':').collect::<String>().to_lowercase();
        match (name.as_str(), closing) {
            ("h1" | "h2" | "h3" | "h4" | "h5" | "h6", false) => out.push_str("\n## "),
            ("li", false) => out.push_str("\n- "),
            ("td" | "th", false) => out.push_str(" | "),
            ("p" | "div" | "br" | "tr" | "table" | "ul" | "ol" | "pre" | "blockquote" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6", _) => out.push('\n'),
            ("ac:structured-macro" | "ac:plain-text-body", _) => out.push('\n'),
            _ => out.push(' '),
        }
    }
    out.push_str(rest);
    decode(&out)
        .lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .map(|l| l.trim_start_matches("| ").to_string())
        .filter(|l| !l.is_empty() && l != "-" && l != "##")
        .collect::<Vec<_>>()
        .join("\n")
}

/// Links on a page: `href`s, and Confluence's own page links (`<ri:page ri:content-title=.. ri:space-key=..>`).
fn page_links(html: &str, own_space: &str) -> (Vec<String>, Vec<PageRef>) {
    let mut hrefs = vec![];
    let mut refs = vec![];
    let mut rest = html;
    while let Some(i) = rest.find('<') {
        let Some(j) = rest[i..].find('>') else { break };
        let tag = &rest[i..i + j];
        rest = &rest[i + j..];
        if let Some(h) = attr(tag, "href").filter(|h| h.starts_with("http://") || h.starts_with("https://")) {
            hrefs.push(h);
        } else if tag.starts_with("<ri:page") {
            if let Some(title) = attr(tag, "ri:content-title") {
                let space = attr(tag, "ri:space-key").unwrap_or_else(|| own_space.to_string());
                refs.push(PageRef::Title { space, title });
            }
        }
    }
    (hrefs, refs)
}

struct Loaded {
    doc: PageDoc,
    id: String,
    nested: Vec<PageRef>,
}

async fn load(wiki: &Confluence<'_>, url: &str, r: PageRef, depth: u8) -> Option<Loaded> {
    let expand = ("expand", "body.storage,space".to_string());
    let page: Value = match r {
        PageRef::Id(id) => wiki.get(&format!("/rest/api/content/{id}"), &[expand]).await.ok()?,
        PageRef::Title { space, title } => {
            let v = wiki.get("/rest/api/content", &[("spaceKey", space), ("title", title), expand]).await.ok()?;
            v["results"].as_array()?.first()?.clone()
        }
    };
    let id = page["id"].as_str()?.to_string();
    let html = page["body"]["storage"]["value"].as_str().unwrap_or("");
    let space = page["space"]["key"].as_str().unwrap_or("");
    let (hrefs, mut nested) = page_links(html, space);
    let mut links = vec![];
    for h in hrefs {
        match parse_ref(&wiki.base, &h) {
            Some(r) => nested.push(r),
            None => links.push(h),
        }
    }
    let kids = wiki
        .get(&format!("/rest/api/content/{id}/child/page"), &[("limit", CHILDREN.to_string())])
        .await
        .ok()
        .and_then(|v| v["results"].as_array().cloned())
        .unwrap_or_default();
    let children = kids.iter().filter_map(|c| c["title"].as_str().map(String::from)).collect();
    nested.extend(kids.iter().filter_map(|c| c["id"].as_str().map(|i| PageRef::Id(i.to_string()))));
    let base = wiki.base.clone();
    let web = page["_links"]["webui"].as_str().map(|w| format!("{base}{w}")).unwrap_or_else(|| url.to_string());
    Some(Loaded {
        doc: PageDoc {
            url: web,
            title: page["title"].as_str().unwrap_or("").to_string(),
            text: cut(&structured(html), if depth == 0 { FIRST_TEXT } else { NESTED_TEXT }),
            children,
            links,
            depth,
        },
        id,
        nested,
    })
}

fn ref_id(r: &PageRef) -> String {
    match r {
        PageRef::Id(id) => format!("id:{id}"),
        PageRef::Title { space, title } => format!("t:{}/{}", space.to_lowercase(), title.to_lowercase()),
    }
}

/// The task's Confluence pages among `urls`, then the pages they lead to, one level deep.
pub async fn read_deep(client: &reqwest::Client, base: &str, pat: &str, urls: &[String]) -> Vec<PageDoc> {
    let wiki = Confluence::new(client, base, pat);
    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<PageDoc> = vec![];
    let mut next: Vec<PageRef> = vec![];
    for u in urls {
        if out.len() >= FIRST {
            break;
        }
        let Some(r) = parse_ref(&wiki.base, u) else { continue };
        if !seen.insert(ref_id(&r)) {
            continue;
        }
        if let Some(p) = load(&wiki, u, r, 0).await {
            if seen.insert(format!("id:{}", p.id)) {
                next.extend(p.nested);
                out.push(p.doc);
            }
        }
    }
    let mut nested = 0;
    for r in next {
        if nested >= NESTED {
            break;
        }
        if !seen.insert(ref_id(&r)) {
            continue;
        }
        if let Some(p) = load(&wiki, "", r, 1).await {
            if seen.insert(format!("id:{}", p.id)) {
                nested += 1;
                out.push(p.doc);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_shape_of_a_page() {
        let html = "<h2>API</h2><p>Endpoint &amp; fields:</p><ul><li>GET /items</li><li>POST <b>/items</b></li></ul>\
            <table><tr><th>Field</th><th>Type</th></tr><tr><td>id</td><td>int</td></tr></table>\
            <ac:structured-macro ac:name=\"code\"><ac:plain-text-body><![CDATA[a < b]]></ac:plain-text-body></ac:structured-macro>";
        assert_eq!(structured(html), "## API\nEndpoint & fields:\n- GET /items\n- POST /items\nField | Type\nid | int\na < b");
    }

    #[test]
    fn finds_links_and_confluence_page_links() {
        let html = r#"<a href="https://git.co/t/a/-/merge_requests/5">MR</a><ac:link><ri:page ri:content-title="Spec &amp; API" /></ac:link><ri:page ri:space-key="OPS" ri:content-title="Deploy"/>"#;
        let (hrefs, refs) = page_links(html, "DEV");
        assert_eq!(hrefs, vec!["https://git.co/t/a/-/merge_requests/5".to_string()]);
        assert_eq!(refs, vec![
            PageRef::Title { space: "DEV".into(), title: "Spec & API".into() },
            PageRef::Title { space: "OPS".into(), title: "Deploy".into() },
        ]);
    }
}
