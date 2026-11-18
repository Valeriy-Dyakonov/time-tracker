//! "Work dashboard": tasks for a profile (developer, QA, lead), with their epics/parents as context. Read-only.
use super::parse::Me;
use super::Jira;
use crate::error::AppResult;
use crate::util::parse_jira_time;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;

/// Resolved tasks are shown for this many days: enough to see what was just finished.
pub const RECENT_DAYS: u32 = 14;
const MAX: usize = 500;
/// More people fields than this would make the JQL unwieldy; real installations have a handful.
const MAX_PEOPLE_FIELDS: usize = 15;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub name: String,
    pub display: String,
    pub me: bool,
}

/// A user-type custom field (Responsible, QA, Reviewer...) and who is in it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldPerson {
    pub field: String,
    pub person: Person,
}

#[derive(Debug, Clone, Serialize)]
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
    pub epic: Option<String>,
    pub fix_versions: Vec<String>,
    pub assignee: Option<Person>,
    pub people: Vec<FieldPerson>,
    /// The user is the assignee or in one of the people fields.
    pub mine: bool,
    /// ms since epoch.
    pub updated: Option<i64>,
    pub resolved: Option<i64>,
    /// YYYY-MM-DD.
    pub due: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub issues: Vec<DashIssue>,
    /// Epics and parents of the issues: shown as group headers, never as tasks.
    pub context: Vec<DashIssue>,
    /// Projects the user takes part in; the scope of the QA and lead views.
    pub projects: Vec<String>,
}

pub(super) struct UserField {
    pub id: String,
    pub name: String,
}

/// User-type custom fields of the installation (Responsible, QA, Tester...): their ids differ everywhere.
pub(super) async fn user_fields(jira: &Jira<'_>) -> Vec<UserField> {
    let Ok(v) = jira.get("/rest/api/2/field", &[]).await else { return vec![] };
    v.as_array()
        .into_iter()
        .flatten()
        .filter(|f| f["custom"].as_bool() == Some(true))
        .filter(|f| {
            let s = &f["schema"];
            s["type"].as_str() == Some("user") || (s["type"].as_str() == Some("array") && s["items"].as_str() == Some("user"))
        })
        .filter_map(|f| Some(UserField { id: f["id"].as_str()?.to_string(), name: f["name"].as_str()?.to_string() }))
        .take(MAX_PEOPLE_FIELDS)
        .collect()
}

fn person(v: &Value, me: &Me) -> Option<Person> {
    let display = v["displayName"].as_str()?;
    let name = v["name"].as_str().or(v["key"].as_str()).unwrap_or("").to_string();
    Some(Person { name, display: display.to_string(), me: me.is(v) })
}

pub(super) fn people(f: &Value, fields: &[UserField], me: &Me) -> Vec<FieldPerson> {
    let mut out = vec![];
    for uf in fields {
        let v = &f[uf.id.as_str()];
        let list: Vec<&Value> = match v.as_array() {
            Some(a) => a.iter().collect(),
            None => vec![v],
        };
        for p in list.into_iter().filter_map(|x| person(x, me)) {
            out.push(FieldPerson { field: uf.name.clone(), person: p });
        }
    }
    out
}

pub(super) fn issue(it: &Value, epic: &Option<String>, fields: &[UserField], me: &Me) -> DashIssue {
    let f = &it["fields"];
    let s = |v: &Value| v.as_str().unwrap_or("").to_string();
    let assignee = person(&f["assignee"], me);
    let people = people(f, fields, me);
    let mine = assignee.as_ref().is_some_and(|a| a.me) || people.iter().any(|p| p.person.me);
    let parent_is_epic = f["parent"]["fields"]["issuetype"]["name"].as_str().is_some_and(|t| t.eq_ignore_ascii_case("epic"));
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
        epic: epic
            .as_ref()
            .and_then(|e| f[e.as_str()].as_str().map(String::from))
            .or_else(|| parent_is_epic.then(|| s(&f["parent"]["key"]))),
        fix_versions: f["fixVersions"].as_array().into_iter().flatten().filter_map(|v| v["name"].as_str().map(String::from)).collect(),
        assignee,
        people,
        mine,
        updated: f["updated"].as_str().and_then(parse_jira_time),
        resolved: f["resolutiondate"].as_str().and_then(parse_jira_time),
        due: f["duedate"].as_str().map(String::from),
    }
}

pub(super) fn field_list(epic: &Option<String>, fields: &[UserField]) -> String {
    let mut f = String::from("summary,status,priority,issuetype,project,parent,updated,resolutiondate,duedate,assignee,fixVersions");
    for id in epic.iter().chain(fields.iter().map(|u| &u.id)) {
        f.push(',');
        f.push_str(id);
    }
    f
}

async fn search_all(jira: &Jira<'_>, jql: &str, fields: &str, max: usize) -> AppResult<Vec<Value>> {
    let mut out = vec![];
    loop {
        let v = jira
            .get(
                "/rest/api/2/search",
                &[("jql", jql.to_string()), ("fields", fields.to_string()), ("startAt", out.len().to_string()), ("maxResults", "100".into())],
            )
            .await?;
        let page = v["issues"].as_array().cloned().unwrap_or_default();
        let total = v["total"].as_u64().unwrap_or(0) as usize;
        let empty = page.is_empty();
        out.extend(page);
        if empty || out.len() >= total || out.len() >= max {
            return Ok(out);
        }
    }
}

/// `cf[10101]` for `customfield_10101`, as JQL wants it.
fn jql_field(id: &str) -> String {
    id.strip_prefix("customfield_").map(|n| format!("cf[{n}]")).unwrap_or_else(|| id.to_string())
}

fn quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Statuses that belong to testing, by name: installations name them differently.
pub fn is_test_status(name: &str) -> bool {
    let n = name.to_lowercase();
    ["test", "qa", "verif", "тест", "провер", "acceptance", "приемк", "приёмк"].iter().any(|w| n.contains(w))
}

async fn test_statuses(jira: &Jira<'_>) -> Vec<String> {
    let Ok(v) = jira.get("/rest/api/2/status", &[]).await else { return vec![] };
    let names: BTreeSet<String> = v
        .as_array()
        .into_iter()
        .flatten()
        .filter(|s| s["statusCategory"]["key"].as_str() != Some("done"))
        .filter_map(|s| s["name"].as_str().map(String::from))
        .filter(|n| is_test_status(n))
        .collect();
    names.into_iter().collect()
}

fn open_or_recent() -> String {
    format!("(resolution = Unresolved OR resolutiondate >= -{RECENT_DAYS}d)")
}

pub async fn load(client: &reqwest::Client, base: &str, pat: &str, profile: &str) -> AppResult<Dashboard> {
    let jira = Jira::new(client, base, pat);
    let me = jira.myself().await?;
    let epic = jira.epic_field().await;
    let fields = user_fields(&jira).await;
    let fl = field_list(&epic, &fields);

    let involved = std::iter::once("assignee = currentUser()".to_string())
        .chain(fields.iter().map(|f| format!("{} = currentUser()", jql_field(&f.id))))
        .collect::<Vec<_>>()
        .join(" OR ");
    let mine_jql = format!("({involved}) AND {} ORDER BY updated DESC", open_or_recent());
    let mut raw = search_all(&jira, &mine_jql, &fl, MAX).await?;
    let projects: BTreeSet<String> = raw.iter().filter_map(|i| i["fields"]["project"]["key"].as_str().map(String::from)).collect();
    let in_projects = projects.iter().map(|p| quote(p)).collect::<Vec<_>>().join(",");

    let extra_jql = match profile {
        "qa" if !projects.is_empty() => {
            let st = test_statuses(&jira).await;
            (!st.is_empty()).then(|| {
                let st = st.iter().map(|s| quote(s)).collect::<Vec<_>>().join(",");
                format!("project in ({in_projects}) AND status in ({st}) ORDER BY updated DESC")
            })
        }
        "lead" if !projects.is_empty() => Some(format!("project in ({in_projects}) AND {} ORDER BY updated DESC", open_or_recent())),
        _ => None,
    };
    if let Some(jql) = extra_jql {
        let seen: BTreeSet<String> = raw.iter().filter_map(|i| i["key"].as_str().map(String::from)).collect();
        raw.extend(search_all(&jira, &jql, &fl, MAX).await?.into_iter().filter(|i| i["key"].as_str().is_some_and(|k| !seen.contains(k))));
    }
    let issues: Vec<DashIssue> = raw.iter().map(|i| issue(i, &epic, &fields, &me)).collect();

    // Epics and parents for the group headers: who is responsible for the epic, what it is about.
    let keys: BTreeSet<&str> = issues.iter().flat_map(|i| [i.epic.as_deref(), i.parent.as_deref()]).flatten().collect();
    let known: BTreeSet<&str> = issues.iter().map(|i| i.key.as_str()).collect();
    let want: Vec<&str> = keys.into_iter().filter(|k| !known.contains(k)).take(200).collect();
    let mut context = vec![];
    for chunk in want.chunks(50) {
        let jql = format!("key in ({})", chunk.join(","));
        if let Ok(found) = search_all(&jira, &jql, &fl, 100).await {
            context.extend(found.iter().map(|i| issue(i, &epic, &fields, &me)));
        }
    }
    Ok(Dashboard { issues, context, projects: projects.into_iter().collect() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn me() -> Me {
        Me { name: "me".into(), key: "".into(), display: "Me".into() }
    }

    #[test]
    fn reads_people_fields_and_marks_mine() {
        let fields = vec![UserField { id: "customfield_1".into(), name: "QA".into() }, UserField { id: "customfield_2".into(), name: "Reviewers".into() }];
        let it = json!({ "key": "A-1", "fields": {
            "summary": "Task", "status": { "name": "To Test", "statusCategory": { "key": "indeterminate" } },
            "issuetype": { "name": "Story" }, "project": { "key": "A", "name": "Alpha" },
            "assignee": { "name": "dev", "displayName": "Dev" },
            "customfield_1": { "name": "me", "displayName": "Me" },
            "customfield_2": [{ "name": "x", "displayName": "X" }, { "name": "y", "displayName": "Y" }],
            "fixVersions": [{ "name": "1.2" }],
            "parent": { "key": "A-0", "fields": { "issuetype": { "name": "Epic" } } }
        }});
        let d = issue(&it, &None, &fields, &me());
        assert!(d.mine);
        assert_eq!(d.assignee.as_ref().map(|a| a.me), Some(false));
        assert_eq!(d.people.iter().map(|p| format!("{}:{}", p.field, p.person.display)).collect::<Vec<_>>(), ["QA:Me", "Reviewers:X", "Reviewers:Y"]);
        assert_eq!((d.epic.as_deref(), d.fix_versions.clone()), (Some("A-0"), vec!["1.2".to_string()]));
    }

    #[test]
    fn helpers() {
        assert_eq!(jql_field("customfield_10101"), "cf[10101]");
        assert_eq!(quote("Ready \"QA\""), "\"Ready \\\"QA\\\"\"");
        assert!(is_test_status("Ready for Test") && is_test_status("На проверке") && !is_test_status("In Progress"));
    }
}
