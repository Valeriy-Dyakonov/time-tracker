//! Jira issues of the work dashboard in the store: written when a board is loaded, read back as the same shape.
use super::fresh::{fetched_at, save_list};
use crate::sources::jira::dashboard::{DashIssue, Dashboard, FieldPerson, LinkRef, Person};
use rusqlite::{params, Connection, Transaction};
use std::collections::HashMap;

const SYSTEM: &str = "jira";
const FIX_VERSION: &str = "fixVersion";

fn context_scope(scope: &str) -> String {
    format!("{scope}.context")
}
fn projects_scope(scope: &str) -> String {
    format!("{scope}.projects")
}

/// Stores a loaded board (or history) under `scope`, replacing its previous list.
pub fn save_board(conn: &mut Connection, scope: &str, d: &Dashboard, at: i64) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    // Only the account the board was loaded with is "me".
    tx.execute("UPDATE cache_user SET me = 0 WHERE system = ?1", [SYSTEM])?;
    for i in d.issues.iter().chain(&d.context) {
        save_issue(&tx, i, at)?;
    }
    save_list(&tx, scope, &keys(&d.issues), at)?;
    save_list(&tx, &context_scope(scope), &keys(&d.context), at)?;
    save_list(&tx, &projects_scope(scope), &d.projects.iter().map(String::as_str).collect::<Vec<_>>(), at)?;
    tx.commit()
}

fn keys(list: &[DashIssue]) -> Vec<&str> {
    list.iter().map(|i| i.key.as_str()).collect()
}

fn save_user(tx: &Transaction, p: &Person) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO cache_user(system, name, display, me) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(system, name) DO UPDATE SET display = excluded.display, me = excluded.me OR cache_user.me",
        params![SYSTEM, p.name, p.display, p.me],
    )?;
    Ok(())
}

fn save_issue(tx: &Transaction, i: &DashIssue, at: i64) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO cache_project(key, name) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET name = excluded.name",
        params![i.project, i.project_name],
    )?;
    if let Some(a) = &i.assignee {
        save_user(tx, a)?;
    }
    for fp in &i.people {
        save_user(tx, &fp.person)?;
    }
    tx.execute(
        "INSERT INTO cache_issue(key, project, summary, status, category, type, priority, parent, epic, assignee, mine, updated, resolved, due, fetched_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15) \
         ON CONFLICT(key) DO UPDATE SET project = ?2, summary = ?3, status = ?4, category = ?5, type = ?6, priority = ?7, parent = ?8, epic = ?9, \
         assignee = ?10, mine = ?11, updated = ?12, resolved = ?13, due = ?14, fetched_at = ?15",
        params![
            i.key, i.project, i.summary, i.status, i.category, i.issue_type, i.priority, i.parent, i.epic,
            i.assignee.as_ref().map(|a| &a.name), i.mine, i.updated, i.resolved, i.due, at
        ],
    )?;
    for table in ["cache_issue_tag", "cache_issue_link", "cache_issue_person"] {
        tx.execute(&format!("DELETE FROM {table} WHERE key = ?1"), [&i.key])?;
    }
    for v in &i.fix_versions {
        tx.execute("INSERT OR IGNORE INTO cache_issue_tag(key, kind, value) VALUES (?1, ?2, ?3)", params![i.key, FIX_VERSION, v])?;
    }
    for l in &i.links {
        tx.execute("INSERT OR IGNORE INTO cache_issue_link(key, other, relation, type) VALUES (?1, ?2, ?3, ?4)", params![i.key, l.key, l.relation, l.issue_type])?;
    }
    for fp in &i.people {
        tx.execute("INSERT OR IGNORE INTO cache_issue_person(key, field, user) VALUES (?1, ?2, ?3)", params![i.key, fp.field, fp.person.name])?;
    }
    Ok(())
}

/// The stored board, or None when `scope` was never loaded.
pub fn load_board(conn: &Connection, scope: &str) -> rusqlite::Result<Option<Dashboard>> {
    let Some(cached_at) = fetched_at(conn, scope)? else { return Ok(None) };
    let projects = conn
        .prepare("SELECT ref FROM cache_member WHERE scope = ?1 ORDER BY ref")?
        .query_map([projects_scope(scope)], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(Some(Dashboard { issues: load_issues(conn, scope)?, context: load_issues(conn, &context_scope(scope))?, projects, cached_at }))
}

fn load_issues(conn: &Connection, scope: &str) -> rusqlite::Result<Vec<DashIssue>> {
    let mut issues: Vec<DashIssue> = conn
        .prepare(
            "SELECT i.key, i.summary, i.status, i.category, i.priority, i.type, i.project, COALESCE(p.name, ''), i.parent, i.epic, \
             i.assignee, COALESCE(u.display, i.assignee), COALESCE(u.me, 0), i.mine, i.updated, i.resolved, i.due \
             FROM cache_member m JOIN cache_issue i ON i.key = m.ref \
             LEFT JOIN cache_project p ON p.key = i.project \
             LEFT JOIN cache_user u ON u.system = ?2 AND u.name = i.assignee \
             WHERE m.scope = ?1 ORDER BY i.updated DESC, i.key",
        )?
        .query_map(params![scope, SYSTEM], |r| {
            let assignee = match r.get::<_, Option<String>>(10)? {
                Some(name) => Some(Person { name, display: r.get(11)?, me: r.get(12)? }),
                None => None,
            };
            Ok(DashIssue {
                key: r.get(0)?, summary: r.get(1)?, status: r.get(2)?, category: r.get(3)?, priority: r.get(4)?, issue_type: r.get(5)?,
                project: r.get(6)?, project_name: r.get(7)?, parent: r.get(8)?, epic: r.get(9)?,
                fix_versions: vec![], links: vec![], assignee, people: vec![],
                mine: r.get(13)?, updated: r.get(14)?, resolved: r.get(15)?, due: r.get(16)?,
            })
        })?
        .collect::<Result<_, _>>()?;

    let mut tags: HashMap<String, Vec<String>> = HashMap::new();
    for row in conn
        .prepare("SELECT t.key, t.value FROM cache_issue_tag t JOIN cache_member m ON m.ref = t.key WHERE m.scope = ?1 AND t.kind = ?2 ORDER BY t.value")?
        .query_map(params![scope, FIX_VERSION], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
    {
        let (k, v) = row?;
        tags.entry(k).or_default().push(v);
    }
    let mut links: HashMap<String, Vec<LinkRef>> = HashMap::new();
    for row in conn
        .prepare("SELECT l.key, l.other, l.type, l.relation FROM cache_issue_link l JOIN cache_member m ON m.ref = l.key WHERE m.scope = ?1 ORDER BY l.other, l.relation")?
        .query_map([scope], |r| Ok((r.get::<_, String>(0)?, LinkRef { key: r.get(1)?, issue_type: r.get(2)?, relation: r.get(3)? })))?
    {
        let (k, v) = row?;
        links.entry(k).or_default().push(v);
    }
    let mut people: HashMap<String, Vec<FieldPerson>> = HashMap::new();
    for row in conn
        .prepare(
            "SELECT p.key, p.field, p.user, COALESCE(u.display, p.user), COALESCE(u.me, 0) FROM cache_issue_person p \
             JOIN cache_member m ON m.ref = p.key LEFT JOIN cache_user u ON u.system = ?2 AND u.name = p.user \
             WHERE m.scope = ?1 ORDER BY p.field, p.user",
        )?
        .query_map(params![scope, SYSTEM], |r| {
            Ok((r.get::<_, String>(0)?, FieldPerson { field: r.get(1)?, person: Person { name: r.get(2)?, display: r.get(3)?, me: r.get(4)? } }))
        })?
    {
        let (k, v) = row?;
        people.entry(k).or_default().push(v);
    }
    for i in &mut issues {
        i.fix_versions = tags.remove(&i.key).unwrap_or_default();
        i.links = links.remove(&i.key).unwrap_or_default();
        i.people = people.remove(&i.key).unwrap_or_default();
    }
    Ok(issues)
}

#[cfg(test)]
mod tests {
    use super::super::fresh::{bind_origin, clear_cache, purge};
    use super::super::{now_ms, Store};
    use super::*;
    use serde_json::to_value;

    fn person(name: &str, me: bool) -> Person {
        Person { name: name.into(), display: format!("{name} display"), me }
    }

    fn issue(key: &str) -> DashIssue {
        DashIssue {
            key: key.into(), summary: format!("{key} summary"), status: "In Progress".into(), category: "indeterminate".into(), priority: "High".into(),
            issue_type: "Task".into(), project: "ABC".into(), project_name: "Project ABC".into(), parent: Some("ABC-1".into()), epic: None,
            fix_versions: vec!["1.0".into(), "1.1".into()], links: vec![LinkRef { key: "ABC-9".into(), issue_type: "Epic".into(), relation: "relates to".into() }],
            assignee: Some(person("ivan", true)), people: vec![FieldPerson { field: "QA".into(), person: person("petr", false) }],
            mine: true, updated: Some(1_700_000_000_000), resolved: None, due: Some("2026-01-31".into()),
        }
    }

    fn board(keys: &[&str]) -> Dashboard {
        Dashboard { issues: keys.iter().map(|k| issue(k)).collect(), context: vec![issue("ABC-1")], projects: vec!["ABC".into(), "XYZ".into()], cached_at: 0 }
    }

    fn sorted(mut d: Dashboard) -> serde_json::Value {
        d.issues.sort_by(|a, b| a.key.cmp(&b.key));
        to_value(&d).unwrap()
    }

    fn count(s: &Store, sql: &str) -> i64 {
        s.with(|c| c.query_row(sql, [], |r| r.get(0))).unwrap()
    }

    #[test]
    fn a_saved_board_reads_back_the_same() {
        let s = Store::memory();
        let at = now_ms();
        let mut want = board(&["ABC-2", "ABC-3"]);
        s.with(|c| save_board(c, "jira.board.dev", &want, at)).unwrap();
        let got = s.with(|c| load_board(c, "jira.board.dev")).unwrap().unwrap();
        assert_eq!(got.cached_at, at);
        want.cached_at = at;
        assert_eq!(sorted(got), sorted(want));
        assert!(s.with(|c| load_board(c, "jira.board.qa")).unwrap().is_none());
    }

    #[test]
    fn saving_again_replaces_the_list_and_does_not_duplicate() {
        let s = Store::memory();
        s.with(|c| save_board(c, "b", &board(&["ABC-2", "ABC-3"]), 1)).unwrap();
        s.with(|c| save_board(c, "b", &board(&["ABC-3"]), 2)).unwrap();
        let got = s.with(|c| load_board(c, "b")).unwrap().unwrap();
        assert_eq!(got.issues.len(), 1);
        assert_eq!(got.issues[0].links.len(), 1);
        assert_eq!(got.issues[0].fix_versions.len(), 2);
        assert_eq!(got.cached_at, 2);
    }

    #[test]
    fn me_follows_the_account_of_the_last_load() {
        let s = Store::memory();
        s.with(|c| save_board(c, "b", &board(&["ABC-2"]), 1)).unwrap();
        let mut other = board(&["ABC-2"]);
        other.issues[0].assignee = Some(person("ivan", false));
        other.issues[0].people[0].person = person("petr", true);
        other.context.clear();
        s.with(|c| save_board(c, "b", &other, 2)).unwrap();
        let got = s.with(|c| load_board(c, "b")).unwrap().unwrap();
        assert!(!got.issues[0].assignee.as_ref().unwrap().me);
        assert!(got.issues[0].people[0].person.me);
    }

    #[test]
    fn purge_drops_old_issues_with_their_rows_and_keeps_fresh_ones() {
        let s = Store::memory();
        let old = now_ms() - 40 * 24 * 60 * 60 * 1000;
        let mut stale = board(&["ABC-2"]);
        stale.context.clear();
        s.with(|c| save_board(c, "old", &stale, old)).unwrap();
        s.with(|c| save_board(c, "new", &board(&["ABC-3"]), now_ms())).unwrap();
        s.with(|c| purge(c)).unwrap();
        assert!(s.with(|c| load_board(c, "old")).unwrap().is_none());
        assert_eq!(count(&s, "SELECT count(*) FROM cache_issue WHERE key = 'ABC-2'"), 0);
        assert_eq!(count(&s, "SELECT count(*) FROM cache_issue_tag WHERE key = 'ABC-2'"), 0);
        assert_eq!(s.with(|c| load_board(c, "new")).unwrap().unwrap().issues.len(), 1);
        // People and projects still used by the fresh board stay.
        assert_eq!(count(&s, "SELECT count(*) FROM cache_user"), 2);
        assert_eq!(count(&s, "SELECT count(*) FROM cache_project"), 1);
    }

    #[test]
    fn a_changed_origin_drops_the_cache_and_clear_keeps_the_origin() {
        let s = Store::memory();
        s.with(|c| bind_origin(c, "jira", "https://one")).unwrap();
        s.with(|c| save_board(c, "b", &board(&["ABC-2"]), 1)).unwrap();
        s.with(|c| bind_origin(c, "jira", "https://one")).unwrap();
        assert!(s.with(|c| load_board(c, "b")).unwrap().is_some());
        s.with(|c| bind_origin(c, "jira", "https://two")).unwrap();
        assert!(s.with(|c| load_board(c, "b")).unwrap().is_none());
        s.with(|c| save_board(c, "b", &board(&["ABC-2"]), 1)).unwrap();
        s.with(|c| clear_cache(c)).unwrap();
        assert_eq!(count(&s, "SELECT count(*) FROM cache_issue"), 0);
        let origin: String = s.with(|c| c.query_row("SELECT value FROM cache_meta WHERE key = 'origin.jira'", [], |r| r.get(0))).unwrap();
        assert_eq!(origin, "https://two");
    }
}
