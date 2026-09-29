-- Growth backend schema (D1 / SQLite).
--
-- Deliberately three tables, each matching an existing in-memory shape
-- 1:1 so the frontend migration is a data-source swap, not a redesign:
--   teams        <- src/store/teamsStore.js's SEED_TEAMS entries
--   buildings    <- src/store/villageStore.js's buildingsByTeam[teamId][tileKey]
--   signal_weeks <- src/data/mockSignals.js's per-source weekly rows
--
-- signal_weeks stores one JSON blob per (team, week, source) rather than a
-- fully normalized schema: the shape already varies per source (jira rows
-- carry a `details[]` of ticket-level breakdowns, calendar rows carry a
-- `details[]` of event-level breakdowns) and nothing server-side needs to
-- query inside it — the API reads it, merges by iso_week, and hands the
-- same shape the frontend has always consumed straight to the client.

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size_bucket TEXT NOT NULL DEFAULT 'Unspecified',
  function_type TEXT NOT NULL DEFAULT 'Unspecified',
  capabilities TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  created_at INTEGER NOT NULL
);

CREATE TABLE buildings (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  archetype TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  col INTEGER NOT NULL,
  row INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_buildings_team ON buildings(team_id);

-- source: 'jira' | 'calendar' | 'github' (github unused until that
-- ingestion step lands, per the existing TODO in mockSignals.js).
CREATE TABLE signal_weeks (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  iso_week TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON blob, shape depends on source
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, iso_week, source)
);

CREATE INDEX idx_signal_weeks_team ON signal_weeks(team_id);
