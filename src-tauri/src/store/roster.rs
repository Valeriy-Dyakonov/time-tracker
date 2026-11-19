//! The team roster: teams in a tree, people in teams, their accounts in the external systems.
//! The screen edits the whole roster and saves it at once (it is small and typed by hand), so saving replaces it.
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

const ROLES: &[&str] = &["lead", "dev", "qa", "devLead", "qaLead", "other"];
const ABSENCE_KINDS: &[&str] = &["vacation", "sick", "other"];
const SYSTEMS: &[&str] = &["jira", "gitlab", "matrix"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub system: String,
    pub ext_id: String,
}

/// A period when the person is away, both dates inclusive (YYYY-MM-DD).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Absence {
    pub kind: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: i64,
    pub team_id: Option<i64>,
    pub name: String,
    pub role: String,
    pub accounts: Vec<Account>,
    #[serde(default)]
    pub absences: Vec<Absence>,
}

/// Both lists keep the order the user arranged.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Roster {
    pub teams: Vec<Team>,
    pub people: Vec<Person>,
}

fn bad(why: &str) -> AppError {
    AppError::new("rosterInvalid").with("why", why)
}

/// Rejects what the tables would silently accept: unknown roles/systems, dangling or cyclic parents, one account on two people.
fn validate(r: &Roster) -> AppResult<()> {
    let team_ids: HashSet<i64> = r.teams.iter().map(|t| t.id).collect();
    if team_ids.len() != r.teams.len() {
        return Err(bad("duplicate team id"));
    }
    let parents: HashMap<i64, Option<i64>> = r.teams.iter().map(|t| (t.id, t.parent_id)).collect();
    for t in &r.teams {
        if t.name.trim().is_empty() {
            return Err(bad("empty team name"));
        }
        if t.parent_id.is_some_and(|p| !team_ids.contains(&p)) {
            return Err(bad("unknown parent"));
        }
        let (mut cur, mut steps) = (t.parent_id, 0);
        while let Some(p) = cur {
            steps += 1;
            if p == t.id || steps > parents.len() {
                return Err(bad("cycle"));
            }
            cur = parents[&p];
        }
    }
    let mut people = HashSet::new();
    let mut accounts = HashSet::new();
    for p in &r.people {
        if !people.insert(p.id) {
            return Err(bad("duplicate person id"));
        }
        if p.name.trim().is_empty() {
            return Err(bad("empty person name"));
        }
        if !ROLES.contains(&p.role.as_str()) {
            return Err(bad("unknown role"));
        }
        if p.team_id.is_some_and(|t| !team_ids.contains(&t)) {
            return Err(bad("unknown team"));
        }
        for a in &p.absences {
            let from = chrono::NaiveDate::parse_from_str(&a.from, "%Y-%m-%d");
            let to = chrono::NaiveDate::parse_from_str(&a.to, "%Y-%m-%d");
            match (from, to) {
                (Ok(f), Ok(t)) if f <= t && ABSENCE_KINDS.contains(&a.kind.as_str()) => {}
                _ => return Err(bad("bad absence")),
            }
        }
        for a in &p.accounts {
            if !SYSTEMS.contains(&a.system.as_str()) || a.ext_id.trim().is_empty() {
                return Err(bad("bad account"));
            }
            if !accounts.insert((a.system.clone(), a.ext_id.clone())) {
                return Err(bad("account on two people"));
            }
        }
    }
    Ok(())
}

pub fn load(conn: &Connection) -> rusqlite::Result<Roster> {
    let teams = conn
        .prepare("SELECT id, parent_id, name FROM team ORDER BY sort")?
        .query_map([], |r| Ok(Team { id: r.get(0)?, parent_id: r.get(1)?, name: r.get(2)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut people = conn
        .prepare("SELECT id, team_id, name, role FROM person ORDER BY sort")?
        .query_map([], |r| Ok(Person { id: r.get(0)?, team_id: r.get(1)?, name: r.get(2)?, role: r.get(3)?, accounts: Vec::new(), absences: Vec::new() }))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut by_person: HashMap<i64, Vec<Account>> = HashMap::new();
    let mut st = conn.prepare("SELECT person_id, system, ext_id FROM account ORDER BY system, ext_id")?;
    for row in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, Account { system: r.get(1)?, ext_id: r.get(2)? })))? {
        let (id, a) = row?;
        by_person.entry(id).or_default().push(a);
    }
    let mut away: HashMap<i64, Vec<Absence>> = HashMap::new();
    let mut st = conn.prepare("SELECT person_id, kind, from_date, to_date FROM absence ORDER BY from_date, sort")?;
    for row in st.query_map([], |r| Ok((r.get::<_, i64>(0)?, Absence { kind: r.get(1)?, from: r.get(2)?, to: r.get(3)? })))? {
        let (id, a) = row?;
        away.entry(id).or_default().push(a);
    }
    for p in &mut people {
        p.accounts = by_person.remove(&p.id).unwrap_or_default();
        p.absences = away.remove(&p.id).unwrap_or_default();
    }
    Ok(Roster { teams, people })
}

/// Replaces the whole roster in one transaction.
pub fn save(conn: &mut Connection, r: &Roster) -> AppResult<()> {
    validate(r)?;
    let run = |conn: &mut Connection| -> rusqlite::Result<()> {
        let tx = conn.transaction()?;
        tx.execute_batch("DELETE FROM absence; DELETE FROM account; DELETE FROM person; DELETE FROM team;")?;
        // A child may come before its parent in the list: foreign keys are checked at commit.
        tx.execute_batch("PRAGMA defer_foreign_keys = ON;")?;
        for (i, t) in r.teams.iter().enumerate() {
            tx.execute("INSERT INTO team(id, parent_id, name, sort) VALUES (?1, ?2, ?3, ?4)", params![t.id, t.parent_id, t.name.trim(), i as i64])?;
        }
        for (i, p) in r.people.iter().enumerate() {
            tx.execute("INSERT INTO person(id, team_id, name, role, sort) VALUES (?1, ?2, ?3, ?4, ?5)", params![p.id, p.team_id, p.name.trim(), p.role, i as i64])?;
            for a in &p.accounts {
                tx.execute("INSERT INTO account(system, ext_id, person_id) VALUES (?1, ?2, ?3)", params![a.system, a.ext_id.trim(), p.id])?;
            }
            for (j, a) in p.absences.iter().enumerate() {
                tx.execute("INSERT INTO absence(person_id, kind, from_date, to_date, sort) VALUES (?1, ?2, ?3, ?4, ?5)", params![p.id, a.kind, a.from, a.to, j as i64])?;
            }
        }
        tx.commit()
    };
    run(conn).map_err(AppError::raw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;

    fn team(id: i64, parent: Option<i64>, name: &str) -> Team {
        Team { id, parent_id: parent, name: name.into() }
    }
    fn person(id: i64, team: Option<i64>, name: &str, role: &str, accounts: &[(&str, &str)]) -> Person {
        Person { id, team_id: team, name: name.into(), role: role.into(), accounts: accounts.iter().map(|(s, e)| Account { system: (*s).into(), ext_id: (*e).into() }).collect(), absences: Vec::new() }
    }
    fn sample() -> Roster {
        Roster {
            // A child listed before its parent must work too.
            teams: vec![team(2, Some(1), "Backend"), team(1, None, "Development")],
            people: vec![
                person(1, Some(2), "Ann", "lead", &[("gitlab", "ann.k"), ("jira", "ann")]), // accounts come back ordered by system
                Person { absences: vec![Absence { kind: "vacation".into(), from: "2026-12-01".into(), to: "2026-12-14".into() }], ..person(2, Some(2), "Bob", "qa", &[]) },
                person(3, None, "Carl", "dev", &[("matrix", "@carl:srv")]),
            ],
        }
    }

    #[test]
    fn a_roster_comes_back_as_it_was_saved() {
        let s = Store::memory();
        let r = sample();
        s.with(|c| Ok(save(c, &r))).unwrap().unwrap();
        let back = s.with(|c| load(c)).unwrap();
        assert_eq!(back.teams, r.teams);
        assert_eq!(back.people, r.people);
    }

    #[test]
    fn saving_again_replaces_everything() {
        let s = Store::memory();
        s.with(|c| Ok(save(c, &sample()))).unwrap().unwrap();
        let small = Roster { teams: vec![team(5, None, "QA")], people: vec![person(9, Some(5), "Dan", "qaLead", &[("jira", "dan")])] };
        s.with(|c| Ok(save(c, &small))).unwrap().unwrap();
        let back = s.with(|c| load(c)).unwrap();
        assert_eq!(back, small);
        let accounts: i64 = s.with(|c| c.query_row("SELECT count(*) FROM account", [], |r| r.get(0))).unwrap();
        assert_eq!(accounts, 1);
    }

    #[test]
    fn deleting_a_team_keeps_its_people_without_a_team() {
        let s = Store::memory();
        s.with(|c| Ok(save(c, &sample()))).unwrap().unwrap();
        s.with(|c| c.execute("DELETE FROM team WHERE id = 1", [])).unwrap();
        let back = s.with(|c| load(c)).unwrap();
        assert!(back.teams.is_empty(), "the child goes with its parent");
        assert!(back.people.iter().all(|p| p.team_id.is_none()));
        assert_eq!(back.people.len(), 3);
    }

    #[test]
    fn invalid_rosters_are_rejected_and_change_nothing() {
        let s = Store::memory();
        s.with(|c| Ok(save(c, &sample()))).unwrap().unwrap();
        let mut cases = Vec::new();
        let mut r = sample();
        r.people[0].role = "boss".into();
        cases.push(r);
        let mut r = sample();
        r.teams[1].parent_id = Some(2); // 1 -> 2 -> 1
        cases.push(r);
        let mut r = sample();
        r.people[1].team_id = Some(99);
        cases.push(r);
        let mut r = sample();
        r.people[1].accounts.push(Account { system: "jira".into(), ext_id: "ann".into() });
        cases.push(r);
        let mut r = sample();
        r.people[2].accounts[0].system = "icq".into();
        cases.push(r);
        let mut r = sample();
        r.teams[0].name = "  ".into();
        cases.push(r);
        for (kind, from, to) in [("vacation", "2026-12-14", "2026-12-01"), ("trip", "2026-12-01", "2026-12-02"), ("sick", "soon", "2026-12-02")] {
            let mut r = sample();
            r.people[1].absences = vec![Absence { kind: kind.into(), from: from.into(), to: to.into() }];
            cases.push(r);
        }
        for r in cases {
            assert!(s.with(|c| Ok(save(c, &r))).unwrap().is_err());
        }
        assert_eq!(s.with(|c| load(c)).unwrap(), sample());
    }

    #[test]
    fn the_cache_cleanup_leaves_the_roster() {
        let s = Store::memory();
        s.with(|c| Ok(save(c, &sample()))).unwrap().unwrap();
        s.with(crate::store::fresh::clear_cache).unwrap();
        s.with(crate::store::fresh::purge).unwrap();
        assert_eq!(s.with(|c| load(c)).unwrap(), sample());
    }
}
