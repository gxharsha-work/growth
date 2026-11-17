-- Outcome of the latest ingestion run per team and source, so the app can
-- tell "connected, but no qualifying data yet" apart from "not connected".
-- detail holds counts only (no names, logins or titles).
CREATE TABLE ingestion_status (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  detail TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, source)
);
