//! GitLab merge requests of the MR board in the store: written when the board is loaded, read back as the same shape.
use super::fresh::{fetched_at, save_list};
use crate::model::MrTask;
use crate::sources::gitlab::board::{Known, Mr, MrBoard, MrKey, MrPerson};
use rusqlite::{params, Connection, Transaction};
use std::collections::HashMap;

const SYSTEM: &str = "gitlab";
const REVIEWER: &str = "reviewer";
const APPROVER: &str = "approver";

fn ref_of(m: &Mr) -> String {
    format!("{}:{}", m.project_id, m.iid)
}

fn save_user(tx: &Transaction, p: &MrPerson, me: bool) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO cache_user(system, name, display, me) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(system, name) DO UPDATE SET display = excluded.display, me = excluded.me OR cache_user.me",
        params![SYSTEM, p.username, p.name, me],
    )?;
    Ok(())
}

/// Stores a loaded board under `scope`, replacing its previous list.
pub fn save_board(conn: &mut Connection, scope: &str, b: &MrBoard, at: i64) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    // Only the account the board was loaded with is "me".
    tx.execute("UPDATE cache_user SET me = 0 WHERE system = ?1", [SYSTEM])?;
    save_user(&tx, &b.me, true)?;
    for m in &b.mrs {
        save_mr(&tx, m, at)?;
    }
    let refs: Vec<String> = b.mrs.iter().map(ref_of).collect();
    save_list(&tx, scope, &refs.iter().map(String::as_str).collect::<Vec<_>>(), at)?;
    tx.commit()
}

fn save_mr(tx: &Transaction, m: &Mr, at: i64) -> rusqlite::Result<()> {
    for p in std::iter::once(&m.author).chain(&m.reviewers).chain(&m.approved_by) {
        save_user(tx, p, false)?;
    }
    tx.execute(
        "INSERT INTO cache_mr(project_id, iid, project, title, web_url, source_branch, author, draft, conflicts, resolved, merge_status, comments, created, updated, approvals_left, detail_at, fetched_at, target_branch, task) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19) \
         ON CONFLICT(project_id, iid) DO UPDATE SET project = ?3, title = ?4, web_url = ?5, source_branch = ?6, author = ?7, draft = ?8, conflicts = ?9, \
         resolved = ?10, merge_status = ?11, comments = ?12, created = ?13, updated = ?14, approvals_left = ?15, detail_at = ?16, fetched_at = ?17, target_branch = ?18, task = ?19",
        params![
            m.project_id, m.iid, m.project, m.title, m.url, m.source_branch, m.author.username, m.draft, m.conflicts, m.discussions_resolved,
            m.merge_status, m.comments, m.created, m.updated, m.approvals_left, m.detailed.then_some(at), at, m.target_branch, m.task
        ],
    )?;
    tx.execute("DELETE FROM cache_mr_person WHERE project_id = ?1 AND iid = ?2", params![m.project_id, m.iid])?;
    for (role, list) in [(REVIEWER, &m.reviewers), (APPROVER, &m.approved_by)] {
        for p in list {
            tx.execute(
                "INSERT OR IGNORE INTO cache_mr_person(project_id, iid, role, user) VALUES (?1, ?2, ?3, ?4)",
                params![m.project_id, m.iid, role, p.username],
            )?;
        }
    }
    Ok(())
}

/// Approvals already read, by MR: the next load reuses them while the MR has not changed.
pub fn known(conn: &Connection) -> rusqlite::Result<HashMap<MrKey, Known>> {
    let mut out: HashMap<MrKey, Known> = conn
        .prepare("SELECT project_id, iid, updated, approvals_left FROM cache_mr WHERE detail_at IS NOT NULL")?
        .query_map([], |r| Ok(((r.get(0)?, r.get(1)?), Known { updated: r.get(2)?, approvals_left: r.get(3)?, approved_by: vec![] })))?
        .collect::<Result<_, _>>()?;
    let mut st = conn.prepare(
        "SELECT p.project_id, p.iid, p.user, COALESCE(u.display, p.user) FROM cache_mr_person p \
         LEFT JOIN cache_user u ON u.system = ?1 AND u.name = p.user WHERE p.role = ?2",
    )?;
    for row in st.query_map(params![SYSTEM, APPROVER], |r| Ok(((r.get(0)?, r.get(1)?), MrPerson { username: r.get(2)?, name: r.get(3)? })))? {
        let (key, p) = row?;
        if let Some(k) = out.get_mut(&key) {
            k.approved_by.push(p);
        }
    }
    Ok(out)
}

/// The board of `scope` as it was stored; `None` when it was never loaded.
pub fn load_board(conn: &Connection, scope: &str) -> rusqlite::Result<Option<MrBoard>> {
    let Some(at) = fetched_at(conn, scope)? else { return Ok(None) };
    let me: Option<MrPerson> = conn
        .query_row("SELECT name, display FROM cache_user WHERE system = ?1 AND me = 1", [SYSTEM], |r| Ok(MrPerson { username: r.get(0)?, name: r.get(1)? }))
        .ok();
    let Some(me) = me else { return Ok(None) };

    let mut people: HashMap<(MrKey, &'static str), Vec<MrPerson>> = HashMap::new();
    let mut st = conn.prepare(
        "SELECT p.project_id, p.iid, p.role, p.user, COALESCE(u.display, p.user) FROM cache_member c \
         JOIN cache_mr_person p ON c.ref = p.project_id || ':' || p.iid \
         LEFT JOIN cache_user u ON u.system = ?2 AND u.name = p.user WHERE c.scope = ?1 ORDER BY p.user",
    )?;
    for row in st.query_map(params![scope, SYSTEM], |r| {
        Ok(((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?), r.get::<_, String>(2)?, MrPerson { username: r.get(3)?, name: r.get(4)? }))
    })? {
        let (key, role, p) = row?;
        let role = if role == APPROVER { APPROVER } else { REVIEWER };
        people.entry((key, role)).or_default().push(p);
    }

    let mut st = conn.prepare(
        "SELECT m.project_id, m.iid, m.project, m.title, m.web_url, m.source_branch, m.author, COALESCE(u.display, m.author), m.draft, m.conflicts, m.resolved, \
         m.merge_status, m.comments, m.created, m.updated, m.approvals_left, m.detail_at IS NOT NULL, m.target_branch, m.task FROM cache_member c \
         JOIN cache_mr m ON c.ref = m.project_id || ':' || m.iid \
         LEFT JOIN cache_user u ON u.system = ?2 AND u.name = m.author WHERE c.scope = ?1 ORDER BY m.updated DESC",
    )?;
    let mrs = st
        .query_map(params![scope, SYSTEM], |r| {
            let key: MrKey = (r.get(0)?, r.get(1)?);
            Ok(Mr {
                project_id: key.0,
                iid: key.1,
                project: r.get(2)?,
                title: r.get(3)?,
                url: r.get(4)?,
                source_branch: r.get(5)?,
                author: MrPerson { username: r.get(6)?, name: r.get(7)? },
                draft: r.get(8)?,
                conflicts: r.get(9)?,
                discussions_resolved: r.get(10)?,
                merge_status: r.get(11)?,
                comments: r.get(12)?,
                created: r.get(13)?,
                updated: r.get(14)?,
                approvals_left: r.get(15)?,
                detailed: r.get(16)?,
                target_branch: r.get(17)?,
                task: r.get(18)?,
                reviewers: vec![],
                approved_by: vec![],
            })
        })?
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(|mut m| {
            let key = (m.project_id, m.iid);
            m.reviewers = people.remove(&(key, REVIEWER)).unwrap_or_default();
            m.approved_by = people.remove(&(key, APPROVER)).unwrap_or_default();
            m
        })
        .collect();
    Ok(Some(MrBoard { me, mrs, cached_at: at, tasks: vec![] }))
}

/// Jira keys of the MRs that are missing in the store or were read longer ago than `max_age_ms`.
pub fn stale_tasks(conn: &Connection, keys: &[String], max_age_ms: i64, now: i64) -> rusqlite::Result<Vec<String>> {
    let mut st = conn.prepare("SELECT fetched_at FROM cache_task WHERE key = ?1")?;
    let mut out = vec![];
    for k in keys {
        let at: Option<i64> = st.query_row([k], |r| r.get(0)).ok();
        if at.map_or(true, |at| now - at > max_age_ms) {
            out.push(k.clone());
        }
    }
    Ok(out)
}

/// Stores what Jira said about `asked`; a key Jira does not know is kept with an empty summary so it is not asked again at once.
pub fn save_tasks(conn: &mut Connection, asked: &[String], found: &[MrTask], at: i64) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for key in asked {
        let t = found.iter().find(|t| &t.key == key);
        tx.execute(
            "INSERT INTO cache_task(key, summary, status, fetched_at) VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(key) DO UPDATE SET summary = ?2, status = ?3, fetched_at = ?4",
            params![key, t.map_or("", |t| t.summary.as_str()), t.map_or("", |t| t.status.as_str()), at],
        )?;
        tx.execute("DELETE FROM cache_task_version WHERE key = ?1", [key])?;
        for v in t.iter().flat_map(|t| &t.fix_versions) {
            tx.execute("INSERT OR IGNORE INTO cache_task_version(key, version) VALUES (?1, ?2)", params![key, v])?;
        }
    }
    tx.commit()
}

/// The known tasks among `keys` (those Jira did not know are left out), versions in the order of their names.
pub fn load_tasks(conn: &Connection, keys: &[String]) -> rusqlite::Result<Vec<MrTask>> {
    let mut out = vec![];
    let mut task = conn.prepare("SELECT summary, status FROM cache_task WHERE key = ?1 AND summary <> ''")?;
    let mut versions = conn.prepare("SELECT version FROM cache_task_version WHERE key = ?1 ORDER BY version")?;
    for k in keys {
        let Ok((summary, status)) = task.query_row([k], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))) else { continue };
        let fix_versions = versions.query_map([k], |r| r.get(0))?.collect::<Result<Vec<String>, _>>()?;
        out.push(MrTask { key: k.clone(), summary, status, fix_versions });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::super::fresh::{bind_origin, clear_cache, purge};
    use super::*;
    use crate::store::Store;

    fn person(u: &str) -> MrPerson {
        MrPerson { username: u.into(), name: u.to_uppercase() }
    }
    fn mr(iid: i64, author: &str, updated: i64) -> Mr {
        Mr {
            project_id: 7,
            iid,
            project: "team/app".into(),
            title: format!("PROJ-{iid} change"),
            url: format!("https://gl/x/-/merge_requests/{iid}"),
            source_branch: "feature".into(),
            target_branch: "release/1.2".into(),
            task: Some(format!("PROJ-{iid}")),
            author: person(author),
            draft: false,
            conflicts: false,
            discussions_resolved: false,
            merge_status: "not_approved".into(),
            comments: 3,
            created: 100,
            updated,
            reviewers: vec![person("rev")],
            approved_by: vec![person("ok")],
            approvals_left: Some(1),
            detailed: true,
        }
    }
    fn board(mrs: Vec<Mr>) -> MrBoard {
        MrBoard { me: person("me"), mrs, cached_at: 0, tasks: vec![] }
    }

    #[test]
    fn a_board_comes_back_as_it_was_saved_newest_first() {
        let s = Store::memory();
        let b = board(vec![mr(1, "ann", 500), mr(2, "bob", 900)]);
        s.with(|c| save_board(c, "gitlab.mr.board", &b, 1000)).unwrap();
        let back = s.with(|c| load_board(c, "gitlab.mr.board")).unwrap().unwrap();
        assert_eq!(back.cached_at, 1000);
        assert_eq!(back.me, person("me"));
        assert_eq!(back.mrs.iter().map(|m| m.iid).collect::<Vec<_>>(), vec![2, 1]);
        let m = back.mrs.iter().find(|m| m.iid == 1).unwrap();
        assert_eq!(*m, b.mrs[0]);
        assert!(s.with(|c| load_board(c, "other")).unwrap().is_none());
    }

    #[test]
    fn saving_again_replaces_the_list_and_the_people() {
        let s = Store::memory();
        s.with(|c| save_board(c, "b", &board(vec![mr(1, "ann", 1), mr(2, "bob", 2)]), 10)).unwrap();
        let mut changed = mr(1, "ann", 5);
        changed.reviewers = vec![person("zed")];
        changed.approved_by = vec![];
        s.with(|c| save_board(c, "b", &board(vec![changed.clone()]), 20)).unwrap();
        let back = s.with(|c| load_board(c, "b")).unwrap().unwrap();
        assert_eq!(back.mrs, vec![changed]);
        let rows: i64 = s.with(|c| c.query_row("SELECT count(*) FROM cache_mr_person WHERE iid = 1", [], |r| r.get(0))).unwrap();
        assert_eq!(rows, 1);
    }

    #[test]
    fn known_approvals_are_offered_for_reuse_only_when_they_were_loaded() {
        let s = Store::memory();
        let mut unread = mr(2, "bob", 2);
        unread.detailed = false;
        unread.approvals_left = None;
        unread.approved_by = vec![];
        s.with(|c| save_board(c, "b", &board(vec![mr(1, "ann", 7), unread]), 10)).unwrap();
        let k = s.with(|c| known(c)).unwrap();
        assert_eq!(k.len(), 1);
        let one = &k[&(7, 1)];
        assert_eq!((one.updated, one.approvals_left), (7, Some(1)));
        assert_eq!(one.approved_by, vec![person("ok")]);
    }

    #[test]
    fn old_rows_are_purged_and_clear_drops_everything() {
        let s = Store::memory();
        s.with(|c| save_board(c, "b", &board(vec![mr(1, "ann", 1)]), 1)).unwrap(); // fetched in 1970
        s.with(|c| purge(c)).unwrap();
        let n: i64 = s.with(|c| c.query_row("SELECT count(*) FROM cache_mr", [], |r| r.get(0))).unwrap();
        let people: i64 = s.with(|c| c.query_row("SELECT count(*) FROM cache_mr_person", [], |r| r.get(0))).unwrap();
        assert_eq!((n, people), (0, 0));

        s.with(|c| save_board(c, "b", &board(vec![mr(1, "ann", 1)]), crate::store::now_ms())).unwrap();
        s.with(|c| purge(c)).unwrap();
        assert!(s.with(|c| load_board(c, "b")).unwrap().is_some(), "a fresh board survives the purge, with its users");
        s.with(|c| clear_cache(c)).unwrap();
        assert!(s.with(|c| load_board(c, "b")).unwrap().is_none());
    }

    #[test]
    fn tasks_are_stored_with_their_releases_and_unknown_keys_are_not_asked_again() {
        let s = Store::memory();
        let found = vec![MrTask { key: "PROJ-1".into(), summary: "Fix".into(), status: "In Progress".into(), fix_versions: vec!["2.0".into(), "1.9".into()] }];
        let asked = vec!["PROJ-1".to_string(), "UTF-8".to_string()];
        s.with(|c| save_tasks(c, &asked, &found, 1000)).unwrap();
        let tasks = s.with(|c| load_tasks(c, &asked)).unwrap();
        assert_eq!(tasks.len(), 1, "the unknown key is left out");
        assert_eq!(tasks[0].fix_versions, vec!["1.9", "2.0"]);
        assert!(s.with(|c| stale_tasks(c, &asked, 60_000, 1500)).unwrap().is_empty());
        assert_eq!(s.with(|c| stale_tasks(c, &asked, 60_000, 100_000)).unwrap().len(), 2);
        assert_eq!(s.with(|c| stale_tasks(c, &["NEW-1".to_string()], 60_000, 1500)).unwrap(), vec!["NEW-1"]);
        let moved = vec![MrTask { fix_versions: vec!["3.0".into()], ..found[0].clone() }];
        s.with(|c| save_tasks(c, &asked[..1], &moved, 2000)).unwrap();
        assert_eq!(s.with(|c| load_tasks(c, &asked[..1])).unwrap()[0].fix_versions, vec!["3.0"]);
    }

    #[test]
    fn another_gitlab_drops_the_cache() {
        let s = Store::memory();
        s.with(|c| bind_origin(c, "gitlab", "https://a")).unwrap();
        s.with(|c| save_board(c, "b", &board(vec![mr(1, "ann", 1)]), 10)).unwrap();
        s.with(|c| bind_origin(c, "gitlab", "https://a")).unwrap();
        assert!(s.with(|c| load_board(c, "b")).unwrap().is_some());
        s.with(|c| bind_origin(c, "gitlab", "https://b")).unwrap();
        assert!(s.with(|c| load_board(c, "b")).unwrap().is_none());
    }
}
