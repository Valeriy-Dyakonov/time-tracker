-- 002_roster: the team roster, typed by the user. No cache_ prefix: never purged, never cleared with the cache.

-- Department -> team -> sub-team by adjacency list.
CREATE TABLE team (
  id        INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES team(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  sort      INTEGER NOT NULL
) STRICT;
CREATE INDEX team_parent ON team(parent_id);

CREATE TABLE person (
  id      INTEGER PRIMARY KEY,
  team_id INTEGER REFERENCES team(id) ON DELETE SET NULL,   -- null = not in any team yet
  name    TEXT NOT NULL,
  role    TEXT NOT NULL,                                      -- dev | qa | lead | other; checked in Rust
  sort    INTEGER NOT NULL
) STRICT;
CREATE INDEX person_team ON person(team_id);

-- Who the person is in each system. An account belongs to one person; a person may have several.
CREATE TABLE account (
  system    TEXT NOT NULL,                                    -- jira | gitlab | matrix; checked in Rust
  ext_id    TEXT NOT NULL,                                    -- Jira user name, GitLab username, Matrix id
  person_id INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  PRIMARY KEY (system, ext_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX account_person ON account(person_id);
