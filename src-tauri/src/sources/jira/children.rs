//! Every task under a task: subtasks, tasks of an epic, their subtasks and so on, and the tasks it is linked to
//! (a release "relates" to the tasks it ships). Read-only.
//! Used to find the development (merge requests) of the whole branch of work, not only of the task itself.
use super::Jira;
use crate::error::AppResult;
use std::collections::HashSet;

/// Levels below the task: epic -> task -> subtask -> a sub-subtask is already unusual.
const MAX_DEPTH: usize = 4;
/// Enough for a big epic; each task costs a GitLab search later.
const MAX_TASKS: usize = 60;
/// Keys in one query.
const BATCH: usize = 40;

fn jql(level: &[String], with_epic: bool) -> String {
    let list = level.join(",");
    if with_epic {
        format!("parent in ({list}) OR \"Epic Link\" in ({list})")
    } else {
        format!("parent in ({list})")
    }
}

async fn search(jira: &Jira<'_>, level: &[String], with_epic: bool) -> AppResult<serde_json::Value> {
    jira.get("/rest/api/2/search", &[("jql", jql(level, with_epic)), ("fields", "key".into()), ("maxResults", "100".into())]).await
}

/// The keys under `key`, level by level (nearest first), without `key` itself.
pub async fn find(client: &reqwest::Client, base: &str, pat: &str, key: &str) -> AppResult<Vec<String>> {
    let jira = Jira::new(client, base, pat);
    let mut seen: HashSet<String> = HashSet::from([key.to_string()]);
    let mut out: Vec<String> = vec![];
    let mut level = vec![key.to_string()];
    // Linked tasks (relates, blocks...) of the task itself; the links of the tasks below are not followed.
    if let Ok(v) = jira.get("/rest/api/2/search", &[("jql", format!("issue in linkedIssues({key})")), ("fields", "key".into()), ("maxResults", "100".into())]).await {
        for i in v["issues"].as_array().into_iter().flatten() {
            if let Some(k) = i["key"].as_str().filter(|k| seen.insert((*k).to_string())) {
                out.push(k.to_string());
                level.push(k.to_string());
            }
        }
    }
    // "Epic Link" does not exist on every installation: the first failure turns it off.
    let mut with_epic = true;
    for _ in 0..MAX_DEPTH {
        let mut next: Vec<String> = vec![];
        for chunk in level.chunks(BATCH) {
            let found = match search(&jira, chunk, with_epic).await {
                Ok(v) => v,
                Err(_) if with_epic => {
                    with_epic = false;
                    search(&jira, chunk, false).await?
                }
                Err(e) => return Err(e),
            };
            for i in found["issues"].as_array().into_iter().flatten() {
                if let Some(k) = i["key"].as_str().filter(|k| seen.insert((*k).to_string())) {
                    next.push(k.to_string());
                }
            }
        }
        out.extend(next.iter().cloned());
        if next.is_empty() || out.len() >= MAX_TASKS {
            break;
        }
        level = next;
    }
    out.truncate(MAX_TASKS);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asks_for_children_by_parent_and_epic() {
        let keys = vec!["A-1".to_string(), "A-2".to_string()];
        assert_eq!(jql(&keys, true), "parent in (A-1,A-2) OR \"Epic Link\" in (A-1,A-2)");
        assert_eq!(jql(&keys, false), "parent in (A-1,A-2)");
    }
}
