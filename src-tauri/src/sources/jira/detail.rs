//! One task read in full for the dashboard's task view: description, comments, people, links. Read-only.
use super::dashboard::{field_list, issue, user_fields, DashIssue, Person};
use super::Jira;
use crate::error::AppResult;
use crate::util::parse_jira_time;
use serde::Serialize;
use serde_json::Value;

/// Older comments are rarely needed to understand where a task stands.
const COMMENTS: usize = 30;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub author: String,
    pub created: Option<i64>,
    /// Jira wiki markup as is; shown as plain text.
    pub body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Related {
    pub key: String,
    pub summary: String,
    pub status: String,
    /// Link wording from the issue's side ("blocks", "is blocked by"...); empty for subtasks.
    pub relation: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueDetail {
    #[serde(flatten)]
    pub base: DashIssue,
    pub reporter: Option<Person>,
    pub created: Option<i64>,
    pub labels: Vec<String>,
    pub components: Vec<String>,
    /// Jira wiki markup as is; shown as plain text.
    pub description: String,
    pub comments: Vec<Comment>,
    /// Comments in the task overall, when more than were returned.
    pub comment_total: usize,
    pub subtasks: Vec<Related>,
    /// Linked tasks with summary and status (the base `links` only carry key and type).
    pub linked: Vec<Related>,
}

fn related(v: &Value, relation: String) -> Option<Related> {
    Some(Related {
        key: v["key"].as_str()?.to_string(),
        summary: v["fields"]["summary"].as_str().unwrap_or("").to_string(),
        status: v["fields"]["status"]["name"].as_str().unwrap_or("").to_string(),
        relation,
    })
}

fn names(v: &Value) -> Vec<String> {
    v.as_array().into_iter().flatten().filter_map(|x| x["name"].as_str().or(x.as_str()).map(String::from)).collect()
}

pub async fn load(client: &reqwest::Client, base: &str, pat: &str, key: &str) -> AppResult<IssueDetail> {
    let jira = Jira::new(client, base, pat);
    let me = jira.myself().await?;
    let epic = jira.epic_field().await;
    let fields = user_fields(&jira).await;
    let fl = format!("{},reporter,created,labels,components,description,comment,subtasks", field_list(&epic, &fields));
    let it = jira.get(&format!("/rest/api/2/issue/{key}"), &[("fields", fl)]).await?;
    let f = &it["fields"];

    let all: Vec<&Value> = f["comment"]["comments"].as_array().into_iter().flatten().collect();
    let comments = all[all.len().saturating_sub(COMMENTS)..]
        .iter()
        .map(|c| Comment {
            author: c["author"]["displayName"].as_str().unwrap_or("").to_string(),
            created: c["created"].as_str().and_then(parse_jira_time),
            body: c["body"].as_str().unwrap_or("").to_string(),
        })
        .collect();
    let linked = f["issuelinks"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|l| {
            let (side, word) = if l["outwardIssue"].is_object() { ("outwardIssue", "outward") } else { ("inwardIssue", "inward") };
            related(&l[side], l["type"][word].as_str().unwrap_or("").to_string())
        })
        .collect();

    Ok(IssueDetail {
        base: issue(&it, &epic, &fields, &me),
        reporter: f["reporter"]["displayName"].as_str().map(|d| Person {
            name: f["reporter"]["name"].as_str().unwrap_or("").to_string(),
            display: d.to_string(),
            me: me.is(&f["reporter"]),
        }),
        created: f["created"].as_str().and_then(parse_jira_time),
        labels: names(&f["labels"]),
        components: names(&f["components"]),
        description: f["description"].as_str().unwrap_or("").to_string(),
        comment_total: f["comment"]["total"].as_u64().map(|n| n as usize).unwrap_or(all.len()),
        comments,
        subtasks: f["subtasks"].as_array().into_iter().flatten().filter_map(|s| related(s, String::new())).collect(),
        linked,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_link_wording_from_the_issue_side() {
        let l = json!({ "key": "B-2", "fields": { "summary": "Other", "status": { "name": "Done" } } });
        let r = related(&l, "blocks".into()).unwrap();
        assert_eq!((r.key.as_str(), r.status.as_str(), r.relation.as_str()), ("B-2", "Done", "blocks"));
        assert_eq!(names(&json!([{ "name": "api" }, "ui"])), vec!["api", "ui"]);
    }
}
