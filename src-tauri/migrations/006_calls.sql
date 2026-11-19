-- Calls seen on this computer (a program holding the microphone). Observed once, cannot be re-fetched,
-- so this is NOT a cache_ table: "Clear cache" keeps it, old rows are purged by age.
CREATE TABLE call_session (
  id      INTEGER PRIMARY KEY,
  app     TEXT NOT NULL,                 -- zoom | teams | telegram ... (the tracked name that matched)
  title   TEXT NOT NULL DEFAULT '',      -- name of the call from its window, may be empty
  started INTEGER NOT NULL,              -- epoch ms
  ended   INTEGER NOT NULL,              -- epoch ms, moved forward on every check while the call goes on
  hidden  INTEGER NOT NULL DEFAULT 0     -- 1 = the user removed it from the list (a row, so a running call does not come back)
) STRICT;
-- Query: calls of a period, and the open call of an app.
CREATE INDEX call_session_started ON call_session(started);
