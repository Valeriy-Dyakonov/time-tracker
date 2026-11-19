-- 007_task_mr: what GitLab said about a task's merge requests (the "Разработка" panel), kept between sessions.
-- A copy of external data: cache_ prefix, cleared with the cache. The list of a task is replaced as a whole on every read.

CREATE TABLE cache_task_mr (
  task          TEXT NOT NULL,                  -- Jira key the MR was searched by; no FK: the task may not be loaded
  project_id    INTEGER NOT NULL,
  iid           INTEGER NOT NULL,
  project       TEXT NOT NULL,
  title         TEXT NOT NULL,
  state         TEXT NOT NULL,                  -- opened | merged | closed | locked
  web_url       TEXT NOT NULL,
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  author        TEXT NOT NULL,
  updated       TEXT NOT NULL,                  -- ISO 8601 as GitLab gave it
  sort          INTEGER NOT NULL,
  fetched_at    INTEGER NOT NULL,
  PRIMARY KEY (task, project_id, iid)
) STRICT, WITHOUT ROWID;

CREATE TABLE cache_task_mr_commit (
  task       TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  iid        INTEGER NOT NULL,
  sort       INTEGER NOT NULL,
  short      TEXT NOT NULL,
  title      TEXT NOT NULL,
  date       TEXT NOT NULL,
  author     TEXT NOT NULL,
  PRIMARY KEY (task, project_id, iid, sort),
  FOREIGN KEY (task, project_id, iid) REFERENCES cache_task_mr(task, project_id, iid) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TABLE cache_task_mr_file (
  task       TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  iid        INTEGER NOT NULL,
  sort       INTEGER NOT NULL,
  path       TEXT NOT NULL,
  PRIMARY KEY (task, project_id, iid, sort),
  FOREIGN KEY (task, project_id, iid) REFERENCES cache_task_mr(task, project_id, iid) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

-- Notes found in the MRs' branches (only when the notes feature is on).
CREATE TABLE cache_task_doc (
  task       TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  path       TEXT NOT NULL,
  project    TEXT NOT NULL,
  ref_name   TEXT NOT NULL,
  mr_iid     INTEGER NOT NULL,
  sort       INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (task, project_id, path)
) STRICT, WITHOUT ROWID;
