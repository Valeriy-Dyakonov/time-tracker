//! A task's merge requests from GitLab (with their commits, files and the notes in their branches) in the store,
//! so the "Разработка" panel opens at once, also after a restart. Written when GitLab was read, read back as the same shape.
use super::fresh::{fetched_at, save_list};
use crate::sources::gitlab::task::{MrCommit, RemoteDoc, TaskMr, TaskMrs};
use rusqlite::{params, Connection};

/// Stores what GitLab said about `task` under `scope`, replacing the previous answer.
pub fn save(conn: &mut Connection, scope: &str, task: &str, d: &TaskMrs, at: i64) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM cache_task_mr WHERE task = ?1", [task])?;
    tx.execute("DELETE FROM cache_task_doc WHERE task = ?1", [task])?;
    for (i, m) in d.mrs.iter().enumerate() {
        tx.execute(
            "INSERT INTO cache_task_mr(task, project_id, iid, project, title, state, web_url, source_branch, target_branch, author, updated, sort, fetched_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![task, m.project_id as i64, m.iid as i64, m.project, m.title, m.state, m.web_url, m.source_branch, m.target_branch, m.author, m.updated, i as i64, at],
        )?;
        for (j, c) in m.commits.iter().enumerate() {
            tx.execute(
                "INSERT INTO cache_task_mr_commit(task, project_id, iid, sort, short, title, date, author) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![task, m.project_id as i64, m.iid as i64, j as i64, c.short, c.title, c.date, c.author],
            )?;
        }
        for (j, f) in m.files.iter().enumerate() {
            tx.execute(
                "INSERT INTO cache_task_mr_file(task, project_id, iid, sort, path) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![task, m.project_id as i64, m.iid as i64, j as i64, f],
            )?;
        }
    }
    for (i, r) in d.docs.iter().enumerate() {
        tx.execute(
            "INSERT OR REPLACE INTO cache_task_doc(task, project_id, path, project, ref_name, mr_iid, sort, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![task, r.project_id as i64, r.path, r.project, r.ref_name, r.mr_iid as i64, i as i64, at],
        )?;
    }
    save_list(&tx, scope, &[], at)?;
    tx.commit()
}

/// What was stored for `task`; `None` when it was never read (or the scope is gone).
pub fn load(conn: &Connection, scope: &str, task: &str) -> rusqlite::Result<Option<TaskMrs>> {
    if fetched_at(conn, scope)?.is_none() {
        return Ok(None);
    }
    let mut mrs = conn
        .prepare("SELECT project_id, iid, project, title, state, web_url, source_branch, target_branch, author, updated FROM cache_task_mr WHERE task = ?1 ORDER BY sort")?
        .query_map([task], |r| {
            Ok(TaskMr {
                project_id: r.get::<_, i64>(0)? as u64,
                iid: r.get::<_, i64>(1)? as u64,
                project: r.get(2)?,
                title: r.get(3)?,
                state: r.get(4)?,
                web_url: r.get(5)?,
                source_branch: r.get(6)?,
                target_branch: r.get(7)?,
                author: r.get(8)?,
                updated: r.get(9)?,
                commits: vec![],
                files: vec![],
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for m in &mut mrs {
        m.commits = conn
            .prepare("SELECT short, title, date, author FROM cache_task_mr_commit WHERE task = ?1 AND project_id = ?2 AND iid = ?3 ORDER BY sort")?
            .query_map(params![task, m.project_id as i64, m.iid as i64], |r| Ok(MrCommit { short: r.get(0)?, title: r.get(1)?, date: r.get(2)?, author: r.get(3)? }))?
            .collect::<Result<_, _>>()?;
        m.files = conn
            .prepare("SELECT path FROM cache_task_mr_file WHERE task = ?1 AND project_id = ?2 AND iid = ?3 ORDER BY sort")?
            .query_map(params![task, m.project_id as i64, m.iid as i64], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
    }
    let docs = conn
        .prepare("SELECT project_id, project, ref_name, path, mr_iid FROM cache_task_doc WHERE task = ?1 ORDER BY sort")?
        .query_map([task], |r| {
            Ok(RemoteDoc { project_id: r.get::<_, i64>(0)? as u64, project: r.get(1)?, ref_name: r.get(2)?, path: r.get(3)?, mr_iid: r.get::<_, i64>(4)? as u64 })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(TaskMrs { configured: true, mrs, docs, error: None }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{fresh, Store};

    fn sample() -> TaskMrs {
        let mr = |iid: u64, files: &[&str]| TaskMr {
            project: "team/app".into(), project_id: 7, iid, title: format!("ABC-1 part {iid}"), state: "merged".into(), web_url: "https://git/x".into(),
            source_branch: "feature/abc-1".into(), target_branch: "main".into(), author: "Ann".into(), updated: "2026-11-11T00:00:00Z".into(),
            commits: vec![MrCommit { short: "abc1234".into(), title: "plan".into(), date: "2026-11-10T00:00:00Z".into(), author: "Ann".into() }],
            files: files.iter().map(|f| (*f).to_string()).collect(),
        };
        TaskMrs {
            configured: true,
            mrs: vec![mr(12, &["a.ts", "docs/ai/ABC-1/plan.md"]), mr(13, &[])],
            docs: vec![RemoteDoc { project_id: 7, project: "team/app".into(), ref_name: "feature/abc-1".into(), path: "docs/ai/ABC-1/plan.md".into(), mr_iid: 12 }],
            error: None,
        }
    }

    #[test]
    fn what_was_read_comes_back_the_same_and_is_replaced_on_the_next_read() {
        let s = Store::memory();
        let d = sample();
        s.with(|c| save(c, "gitlab.task.ABC-1", "ABC-1", &d, 1000)).unwrap();
        let back = s.with(|c| load(c, "gitlab.task.ABC-1", "ABC-1")).unwrap().unwrap();
        assert_eq!(serde_json::to_value(&back).unwrap(), serde_json::to_value(&d).unwrap());

        let mut fewer = sample();
        fewer.mrs.truncate(1);
        fewer.docs.clear();
        s.with(|c| save(c, "gitlab.task.ABC-1", "ABC-1", &fewer, 2000)).unwrap();
        let back = s.with(|c| load(c, "gitlab.task.ABC-1", "ABC-1")).unwrap().unwrap();
        assert_eq!((back.mrs.len(), back.docs.len()), (1, 0));
        let children: i64 = s.with(|c| c.query_row("SELECT count(*) FROM cache_task_mr_commit", [], |r| r.get(0))).unwrap();
        assert_eq!(children, 1);
    }

    #[test]
    fn a_task_never_read_has_nothing_and_clearing_the_cache_empties_it() {
        let s = Store::memory();
        assert!(s.with(|c| load(c, "gitlab.task.ABC-1", "ABC-1")).unwrap().is_none());
        s.with(|c| save(c, "gitlab.task.ABC-1", "ABC-1", &sample(), 1000)).unwrap();
        s.with(fresh::clear_cache).unwrap();
        assert!(s.with(|c| load(c, "gitlab.task.ABC-1", "ABC-1")).unwrap().is_none());
        let n: i64 = s.with(|c| c.query_row("SELECT count(*) FROM cache_task_mr", [], |r| r.get(0))).unwrap();
        assert_eq!(n, 0);
    }
}
