-- 003_absence: when a person is away (vacation, sick leave...). Typed by the user, like the rest of the roster.
CREATE TABLE absence (
  id        INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,                  -- vacation | sick | other; checked in Rust
  from_date TEXT NOT NULL,                  -- YYYY-MM-DD, inclusive
  to_date   TEXT NOT NULL,                  -- YYYY-MM-DD, inclusive
  sort      INTEGER NOT NULL
) STRICT;
CREATE INDEX absence_person ON absence(person_id);
