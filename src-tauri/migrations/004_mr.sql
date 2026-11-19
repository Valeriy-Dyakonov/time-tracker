-- 004_mr: GitLab merge requests for the MR board (open ones only). cache_* = copies of GitLab, safe to drop.

CREATE TABLE cache_mr (
  project_id     INTEGER NOT NULL,
  iid            INTEGER NOT NULL,
  project        TEXT NOT NULL,        -- path, for display
  title          TEXT NOT NULL,
  web_url        TEXT NOT NULL,
  source_branch  TEXT NOT NULL,
  author         TEXT NOT NULL,        -- cache_user.name (gitlab)
  draft          INTEGER NOT NULL,
  conflicts      INTEGER NOT NULL,
  resolved       INTEGER NOT NULL,     -- 1 = no unresolved discussion threads
  merge_status   TEXT NOT NULL,        -- GitLab detailed_merge_status
  comments       INTEGER NOT NULL,     -- user notes
  created        INTEGER NOT NULL,
  updated        INTEGER NOT NULL,     -- GitLab updated_at: when it changes, the approvals are read again
  approvals_left INTEGER,              -- NULL = not known (no approval rules, or not loaded)
  detail_at      INTEGER,              -- approvals loaded at; NULL = never
  fetched_at     INTEGER NOT NULL,
  PRIMARY KEY (project_id, iid)
) STRICT, WITHOUT ROWID;
CREATE INDEX cache_mr_fetched ON cache_mr(fetched_at);                 -- purge of old rows

-- Reviewers asked for a review and users who approved.
CREATE TABLE cache_mr_person (
  project_id INTEGER NOT NULL,
  iid        INTEGER NOT NULL,
  role       TEXT NOT NULL,            -- reviewer | approver
  user       TEXT NOT NULL,            -- cache_user.name (gitlab)
  PRIMARY KEY (project_id, iid, role, user),
  FOREIGN KEY (project_id, iid) REFERENCES cache_mr(project_id, iid) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;
CREATE INDEX cache_mr_person_user ON cache_mr_person(user);            -- "where I am a reviewer"
