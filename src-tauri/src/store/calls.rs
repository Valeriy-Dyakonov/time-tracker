//! Calls seen on this computer. A call is one row; every check moves its end forward while the call goes on.
use rusqlite::{params, Connection};
use serde::Serialize;

/// A call that was not seen for this long is over; the next sighting starts a new row.
const GAP_MS: i64 = 90_000;
/// Shorter "calls" are a program touching the microphone, not a conversation.
pub const MIN_MS: i64 = 60_000;
const KEEP_DAYS: i64 = 90;

/// What one check found: the call is going on now.
#[derive(Debug, Clone, PartialEq)]
pub struct Seen {
    pub app: String,
    pub title: String,
    /// When Windows says the microphone was taken, if that is recent (gives the exact start).
    pub since: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Call {
    pub id: i64,
    pub app: String,
    pub title: String,
    pub started: i64,
    pub ended: i64,
    /// The user said it was not work.
    pub hidden: bool,
}

pub fn record(conn: &Connection, seen: &[Seen], now: i64) -> rusqlite::Result<()> {
    for s in seen {
        let open: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, title FROM call_session WHERE app = ?1 AND ended >= ?2 ORDER BY ended DESC LIMIT 1",
                params![s.app, now - GAP_MS],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        match open {
            Some((id, title)) => {
                let title = if s.title.is_empty() { title } else { s.title.clone() };
                conn.execute("UPDATE call_session SET ended = ?1, title = ?2 WHERE id = ?3", params![now, title, id])?;
            }
            None => {
                let started = s.since.filter(|t| *t <= now && now - t < 10 * 60_000).unwrap_or(now);
                conn.execute(
                    "INSERT INTO call_session(app, title, started, ended) VALUES (?1, ?2, ?3, ?4)",
                    params![s.app, s.title, started, now],
                )?;
            }
        }
    }
    Ok(())
}

/// Calls that began in `[from, to)`, oldest first; one-minute blips are left out. Calls the user marked
/// as not work come back only with `with_hidden` (the list where they can be returned).
pub fn between(conn: &Connection, from: i64, to: i64, with_hidden: bool) -> rusqlite::Result<Vec<Call>> {
    let mut st = conn.prepare(
        "SELECT id, app, title, started, ended, hidden FROM call_session WHERE started >= ?1 AND started < ?2 AND ended - started >= ?3 AND (hidden = 0 OR ?4) ORDER BY started",
    )?;
    let rows = st.query_map(params![from, to, MIN_MS, with_hidden], |r| {
        Ok(Call { id: r.get(0)?, app: r.get(1)?, title: r.get(2)?, started: r.get(3)?, ended: r.get(4)?, hidden: r.get::<_, i64>(5)? != 0 })
    })?;
    rows.collect()
}

/// Marks a call as not work (it leaves the hours) or returns it. The row stays either way, so a call
/// still going on is not added again.
pub fn set_hidden(conn: &Connection, id: i64, hidden: bool) -> rusqlite::Result<()> {
    conn.execute("UPDATE call_session SET hidden = ?2 WHERE id = ?1", params![id, hidden])?;
    Ok(())
}

pub fn purge(conn: &Connection, now: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM call_session WHERE started < ?1", params![now - KEEP_DAYS * 86_400_000])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;

    fn seen(app: &str, title: &str) -> Seen {
        Seen { app: app.into(), title: title.into(), since: None }
    }

    #[test]
    fn checks_in_a_row_make_one_call_and_a_gap_makes_two() {
        let s = Store::memory();
        let t0 = 1_000_000_000_000;
        s.with(|c| {
            record(c, &[seen("zoom", "")], t0)?;
            record(c, &[seen("zoom", "Daily")], t0 + 30_000)?;
            record(c, &[seen("zoom", "")], t0 + 60_000)?;
            record(c, &[seen("zoom", "")], t0 + 10 * 60_000)?;
            record(c, &[seen("zoom", "")], t0 + 10 * 60_000 + 30_000)?;
            let got = between(c, t0, t0 + 3_600_000, false)?;
            assert_eq!(got.len(), 1, "the second call lasts 30 s and is a blip");
            assert_eq!((got[0].title.as_str(), got[0].started, got[0].ended), ("Daily", t0, t0 + 60_000));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn other_apps_do_not_extend_each_other_and_a_recent_start_is_used() {
        let s = Store::memory();
        let t0 = 2_000_000_000_000;
        s.with(|c| {
            record(c, &[Seen { app: "zoom".into(), title: String::new(), since: Some(t0 - 120_000) }], t0)?;
            record(c, &[seen("teams", "")], t0 + 1_000)?;
            record(c, &[seen("zoom", "")], t0 + 90_000)?;
            record(c, &[seen("teams", "")], t0 + 91_000)?;
            let got = between(c, 0, i64::MAX, false)?;
            assert_eq!(got.len(), 2);
            assert_eq!((got[0].app.as_str(), got[0].started), ("zoom", t0 - 120_000));
            assert_eq!((got[1].app.as_str(), got[1].started, got[1].ended), ("teams", t0 + 1_000, t0 + 91_000));
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn a_hidden_call_stays_hidden_while_it_goes_on() {
        let s = Store::memory();
        let t0 = 4_000_000_000_000;
        s.with(|c| {
            record(c, &[seen("zoom", "")], t0)?;
            record(c, &[seen("zoom", "")], t0 + 70_000)?;
            let id = between(c, 0, i64::MAX, false)?[0].id;
            set_hidden(c, id, true)?;
            record(c, &[seen("zoom", "")], t0 + 100_000)?;
            assert!(between(c, 0, i64::MAX, false)?.is_empty());
            let all = between(c, 0, i64::MAX, true)?;
            assert!(all.len() == 1 && all[0].hidden);
            set_hidden(c, id, false)?;
            assert_eq!(between(c, 0, i64::MAX, false)?.len(), 1);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn old_calls_are_purged_and_clear_cache_keeps_the_rest() {
        let s = Store::memory();
        let now = 3_000_000_000_000;
        s.with(|c| {
            c.execute("INSERT INTO call_session(app, title, started, ended) VALUES ('zoom', '', ?1, ?2)", params![now - 100 * 86_400_000, now - 100 * 86_400_000 + 600_000])?;
            c.execute("INSERT INTO call_session(app, title, started, ended) VALUES ('zoom', '', ?1, ?2)", params![now - 86_400_000, now - 86_400_000 + 600_000])?;
            purge(c, now)?;
            crate::store::fresh::clear_cache(c)?;
            assert_eq!(between(c, 0, i64::MAX, false)?.len(), 1);
            Ok(())
        })
        .unwrap();
    }
}
