-- 005_mr_tasks: which Jira task an MR is about, and that task's release, so the MR board can group by them.

ALTER TABLE cache_mr ADD COLUMN target_branch TEXT NOT NULL DEFAULT '';
ALTER TABLE cache_mr ADD COLUMN task TEXT;               -- Jira key found in the title or branch; no FK: it may not be loaded

-- Jira tasks mentioned by MRs. An empty summary = Jira does not know the key (so it is not asked again at once).
CREATE TABLE cache_task (
  key        TEXT PRIMARY KEY,
  summary    TEXT NOT NULL,
  status     TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE cache_task_version (
  key     TEXT NOT NULL REFERENCES cache_task(key) ON DELETE CASCADE,
  version TEXT NOT NULL,                                  -- fix version = release
  PRIMARY KEY (key, version)
) STRICT, WITHOUT ROWID;
