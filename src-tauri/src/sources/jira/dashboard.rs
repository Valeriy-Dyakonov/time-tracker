//! "Work dashboard": the user's open tasks and the ones resolved recently. Read-only.
use super::Jira;
use crate::error::AppResult;
use crate::util::parse_jira_time;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashIssue {
    pub key: String,
    pub summary: String,
    pub status: String,
    /// Jira status category: "new" (to do), "indeterminate" (in progress), "done".
    pub category: String,
    pub priority: String,
    pub issue_type: String,
    pub project: String,
    pub project_name: String,
    pub parent: Option<String>,
    /// ms since epoch.
    pub updated: Option<i64>,
    pub resolved: Option<i64>,
    /// YYYY-MM-DD.
    pub due: Option<String>,
}

/// Resolved tasks are shown for this many days: enough to see what was just finished.
pub const RECENT_DAYS: u32 = 14;
const MAX: usize = 500;

fn issue(it: &Value) -> DashIssue {
    let f = &it["fields"];
    let s = |v: &Value| v.as_str().unwrap_or("").to_string();
    DashIssue {
        key: s(&it["key"]),
        summary: s(&f["summary"]),
        status: s(&f["status"]["name"]),
        category: f["status"]["statusCategory"]["key"].as_str().unwrap_or("new").to_string(),
        priority: s(&f["priority"]["name"]),
        issue_type: s(&f["issuetype"]["name"]),
        project: s(&f["project"]["key"]),
        project_name: s(&f["project"]["name"]),
        parent: f["parent"]["key"].as_str().map(String::from),
        updated: f["updated"].as_str().and_then(parse_jira_time),
        resolved: f["resolutiondate"].as_str().and_then(parse_jira_time),
        due: f["duedate"].as_str().map(String::from),
    }
}

pub async fn my_issues(client: &reqwest::Client, base: &str, pat: &str) -> AppResult<Vec<DashIssue>> {
    let jira = Jira::new(client, base, pat);
    let jql = format!(
        "assignee = currentUser() AND (resolution = Unresolved OR resolutiondate >= -{RECENT_DAYS}d) ORDER BY updated DESC"
    );
    let fields = "summary,status,priority,issuetype,project,parent,updated,resolutiondate,duedate".to_string();
    let mut out = vec![];
    loop {
        let v = jira
            .get(
                "/rest/api/2/search",
                &[("jql", jql.clone()), ("fields", fields.clone()), ("startAt", out.len().to_string()), ("maxResults", "100".into())],
            )
            .await?;
        let page: Vec<DashIssue> = v["issues"].as_array().into_iter().flatten().map(issue).collect();
        let total = v["total"].as_u64().unwrap_or(0) as usize;
        let empty = page.is_empty();
        out.extend(page);
        if empty || out.len() >= total || out.len() >= MAX {
            return Ok(out);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_status_category_and_dates() {
        let it = json!({ "key": "A-1", "fields": {
            "summary": "Task", "status": { "name": "In Review", "statusCategory": { "key": "indeterminate" } },
            "priority": { "name": "High" }, "issuetype": { "name": "Story" }, "project": { "key": "A", "name": "Alpha" },
            "updated": "2026-11-10T09:00:00.000+0000", "duedate": "2026-11-20", "resolutiondate": null
        }});
        let d = issue(&it);
        assert_eq!((d.status.as_str(), d.category.as_str(), d.project.as_str()), ("In Review", "indeterminate", "A"));
        assert_eq!(d.due.as_deref(), Some("2026-11-20"));
        assert!(d.updated.is_some() && d.resolved.is_none());
    }
}
