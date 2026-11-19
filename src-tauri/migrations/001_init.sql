-- 001_init: refresh bookkeeping and the Jira issue cache (work dashboard).
-- cache_* tables are copies of external data and can be dropped any time; anything else is typed by the user.
-- Rules and the plan for the next tables (merge requests, team roster): .claude/skills/storage-design (local).

-- Which external system/account the cache belongs to (e.g. 'jira' -> its URL); a change drops the cache.
CREATE TABLE cache_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- What was asked from an API and when ("scope"); lets a list be read again without a call.
CREATE TABLE cache_scope (
  scope      TEXT PRIMARY KEY,         -- 'jira.board.dev', 'jira.history.dev.30'
  fetched_at INTEGER NOT NULL          -- epoch ms
) STRICT, WITHOUT ROWID;

-- What a scope returned (the list itself). Replaced as a whole on every refresh,
-- so items that dropped out of the list disappear from it.
CREATE TABLE cache_member (
  scope TEXT NOT NULL REFERENCES cache_scope(scope) ON DELETE CASCADE,
  ref   TEXT NOT NULL,                 -- issue key, project key, ...
  PRIMARY KEY (scope, ref)
) STRICT, WITHOUT ROWID;

-- A person in an external system; issues refer to them by name.
CREATE TABLE cache_user (
  system  TEXT NOT NULL,               -- jira | gitlab
  name    TEXT NOT NULL,               -- login
  display TEXT NOT NULL,
  me      INTEGER NOT NULL,            -- 1 = the account the app is signed in with
  PRIMARY KEY (system, name)
) STRICT, WITHOUT ROWID;

CREATE TABLE cache_project (
  key  TEXT PRIMARY KEY,
  name TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- Jira issue: scalar facts only. One row per key, shared by every screen and profile.
CREATE TABLE cache_issue (
  key        TEXT PRIMARY KEY,
  project    TEXT NOT NULL,            -- cache_project.key
  summary    TEXT NOT NULL,
  status     TEXT NOT NULL,
  category   TEXT NOT NULL,            -- new | indeterminate | done
  type       TEXT NOT NULL,
  priority   TEXT NOT NULL,
  parent     TEXT,                     -- issue key, no FK: the parent may not be loaded
  epic       TEXT,
  assignee   TEXT,                     -- cache_user.name (jira)
  mine       INTEGER NOT NULL,         -- the user is the assignee or in a people field
  updated    INTEGER,
  resolved   INTEGER,
  due        TEXT,                     -- YYYY-MM-DD
  fetched_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX cache_issue_fetched ON cache_issue(fetched_at);           -- purge of old rows

-- Fix versions (and later labels, components): one table for all tag-like lists.
CREATE TABLE cache_issue_tag (
  key   TEXT NOT NULL REFERENCES cache_issue(key) ON DELETE CASCADE,
  kind  TEXT NOT NULL,                 -- fixVersion | label | component
  value TEXT NOT NULL,
  PRIMARY KEY (key, kind, value)
) STRICT, WITHOUT ROWID;

-- Linked issues with the issue type of the other end and the relation wording.
CREATE TABLE cache_issue_link (
  key      TEXT NOT NULL REFERENCES cache_issue(key) ON DELETE CASCADE,
  other    TEXT NOT NULL,
  relation TEXT NOT NULL,
  type     TEXT NOT NULL,
  PRIMARY KEY (key, other, relation)
) STRICT, WITHOUT ROWID;

-- "People fields" of the installation (Responsible, QA...).
CREATE TABLE cache_issue_person (
  key   TEXT NOT NULL REFERENCES cache_issue(key) ON DELETE CASCADE,
  field TEXT NOT NULL,
  user  TEXT NOT NULL,                 -- cache_user.name (jira)
  PRIMARY KEY (key, field, user)
) STRICT, WITHOUT ROWID;
CREATE INDEX cache_issue_person_user ON cache_issue_person(user);      -- tasks of a person
