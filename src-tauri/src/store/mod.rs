//! Local SQLite store: a cache of what the external APIs returned, so a screen does not call them again
//! until the user refreshes or the data gets old. Only Rust touches it; the frontend sees the same commands.
//!
//! `cache_*` tables are copies of external data (see `fresh::clear_cache`); other tables hold what the
//! user typed and are never purged. Migrations are the numbered files in `migrations/`, applied in order.
pub mod fresh;
pub mod issues;
pub mod roster;

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

/// Appended to, never edited: the applied count is kept in `PRAGMA user_version`.
const MIGRATIONS: &[&str] = &[include_str!("../../migrations/001_init.sql"), include_str!("../../migrations/002_roster.sql"), include_str!("../../migrations/003_absence.sql")];

pub struct Store {
    conn: Mutex<Connection>,
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl Store {
    pub fn open(path: &Path) -> AppResult<Self> {
        Self::init(Connection::open(path).map_err(AppError::raw)?)
    }

    #[cfg(test)]
    pub fn memory() -> Self {
        Self::init(Connection::open_in_memory().unwrap()).unwrap()
    }

    fn init(mut conn: Connection) -> AppResult<Self> {
        // auto_vacuum only takes effect before the first table exists.
        conn.execute_batch("PRAGMA auto_vacuum = INCREMENTAL; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;")
            .map_err(AppError::raw)?;
        migrate(&mut conn).map_err(AppError::raw)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    /// Runs `f` on the connection; a transaction is up to `f` (`conn.transaction()`).
    pub fn with<T>(&self, f: impl FnOnce(&mut Connection) -> rusqlite::Result<T>) -> AppResult<T> {
        let mut conn = self.conn.lock().map_err(|_| AppError::raw("store is locked"))?;
        f(&mut conn).map_err(AppError::raw)
    }
}

fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    let done: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(done as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_keeps_its_data_and_is_not_migrated_twice() {
        let dir = std::env::temp_dir().join(format!("wl-store-{}", now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("worklog.db");
        let s = Store::open(&path).unwrap();
        s.with(|c| c.execute("INSERT INTO cache_meta(key, value) VALUES ('k', 'v')", [])).unwrap();
        drop(s);
        let s = Store::open(&path).unwrap();
        let v: String = s.with(|c| c.query_row("SELECT value FROM cache_meta WHERE key = 'k'", [], |r| r.get(0))).unwrap();
        assert_eq!(v, "v");
        let mode: String = s.with(|c| c.query_row("PRAGMA journal_mode", [], |r| r.get(0))).unwrap();
        let vacuum: i64 = s.with(|c| c.query_row("PRAGMA auto_vacuum", [], |r| r.get(0))).unwrap();
        assert_eq!((mode.as_str(), vacuum), ("wal", 2));
        drop(s);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrations_apply_once_and_enable_incremental_vacuum() {
        let s = Store::memory();
        s.with(|c| {
            let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
            assert_eq!(v, MIGRATIONS.len() as i64);
            let tables: i64 = c.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='cache_issue'", [], |r| r.get(0))?;
            assert_eq!(tables, 1);
            // A second run does nothing.
            migrate(c)?;
            let fk: i64 = c.query_row("PRAGMA foreign_keys", [], |r| r.get(0))?;
            assert_eq!(fk, 1);
            Ok(())
        })
        .unwrap();
    }
}
