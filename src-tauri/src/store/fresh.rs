//! When a list was loaded, what it contained, and what to throw away. Generic for every cache table.
use super::now_ms;
use rusqlite::{params, Connection, Transaction};
use std::time::Duration;

/// How long a loaded list is used as is before the next open asks the API again. "Refresh" ignores it.
pub const BOARD_TTL: Duration = Duration::from_secs(10 * 60);

const DAY_MS: i64 = 24 * 60 * 60 * 1000;
/// Issues not refreshed for this long are dropped; they will be read again if a screen needs them.
const ISSUE_KEEP_DAYS: i64 = 30;
const SCOPE_KEEP_DAYS: i64 = 30;

pub fn is_fresh(conn: &Connection, scope: &str, ttl: Duration) -> rusqlite::Result<bool> {
    Ok(fetched_at(conn, scope)?.is_some_and(|at| now_ms() - at < ttl.as_millis() as i64))
}

pub fn fetched_at(conn: &Connection, scope: &str) -> rusqlite::Result<Option<i64>> {
    conn.query_row("SELECT fetched_at FROM cache_scope WHERE scope = ?1", [scope], |r| r.get(0))
        .map(Some)
        .or_else(|e| if matches!(e, rusqlite::Error::QueryReturnedNoRows) { Ok(None) } else { Err(e) })
}

/// Records a loaded list: when it was loaded and which items it had (replacing the previous list).
pub fn save_list(tx: &Transaction, scope: &str, refs: &[&str], at: i64) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO cache_scope(scope, fetched_at) VALUES (?1, ?2) ON CONFLICT(scope) DO UPDATE SET fetched_at = ?2",
        params![scope, at],
    )?;
    tx.execute("DELETE FROM cache_member WHERE scope = ?1", [scope])?;
    let mut ins = tx.prepare_cached("INSERT OR IGNORE INTO cache_member(scope, ref) VALUES (?1, ?2)")?;
    for r in refs {
        ins.execute(params![scope, r])?;
    }
    Ok(())
}

/// The cache of another account or server must not be shown: a changed origin drops the whole cache.
pub fn bind_origin(conn: &mut Connection, system: &str, origin: &str) -> rusqlite::Result<()> {
    let key = format!("origin.{system}");
    let stored: Option<String> = conn.query_row("SELECT value FROM cache_meta WHERE key = ?1", [&key], |r| r.get(0)).ok();
    if stored.as_deref() == Some(origin) {
        return Ok(());
    }
    clear_cache(conn)?;
    conn.execute("INSERT INTO cache_meta(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2", params![key, origin])?;
    Ok(())
}

/// Removes old rows (children go with them) and gives the space back to the disk.
pub fn purge(conn: &mut Connection) -> rusqlite::Result<()> {
    let now = now_ms();
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM cache_issue WHERE fetched_at < ?1", [now - ISSUE_KEEP_DAYS * DAY_MS])?;
    tx.execute("DELETE FROM cache_scope WHERE fetched_at < ?1", [now - SCOPE_KEEP_DAYS * DAY_MS])?;
    tx.execute(
        "DELETE FROM cache_user WHERE name NOT IN (SELECT assignee FROM cache_issue WHERE assignee IS NOT NULL) \
         AND name NOT IN (SELECT user FROM cache_issue_person)",
        [],
    )?;
    tx.execute("DELETE FROM cache_project WHERE key NOT IN (SELECT project FROM cache_issue)", [])?;
    tx.commit()?;
    conn.execute_batch("PRAGMA incremental_vacuum;")
}

/// Empties every `cache_*` table; what the user typed (tables without the prefix) stays.
pub fn clear_cache(conn: &mut Connection) -> rusqlite::Result<()> {
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 6) = 'cache_' AND name <> 'cache_meta'")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let tx = conn.transaction()?;
    for t in &tables {
        tx.execute(&format!("DELETE FROM {t}"), [])?;
    }
    tx.commit()?;
    conn.execute_batch("PRAGMA incremental_vacuum;")
}
