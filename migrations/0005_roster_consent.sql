-- Team roster with per-member opt-in consent (FR4 roster, FR18 consent).
--
-- One row per member. `consented` is recorded by the team lead after the
-- member opts in (manual entry or CSV import). A live team is scored only
-- while at least 3 members have opted in (MIN_CONSENTED in _lib/roster.ts);
-- below that the API withholds the team's signals entirely.
--
-- The demo teams (platform, backend) use fictional people and synthetic
-- data, so they are seeded fully consented. The live pilot team (solstice)
-- is seeded with consent NOT recorded: the team lead records it in the app.

CREATE TABLE roster_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  consented INTEGER NOT NULL DEFAULT 0 CHECK (consented IN (0, 1)),
  consent_updated_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE (team_id, name)
);

CREATE INDEX idx_roster_team ON roster_members(team_id);

INSERT INTO roster_members (team_id, name, role, consented, consent_updated_at, updated_at) VALUES
  ('platform', 'Ava Stone', 'Tech Lead', 1, 0, 0),
  ('platform', 'Marcus Cole', 'Platform Engineer', 1, 0, 0),
  ('platform', 'Priya Nandan', 'Platform Engineer', 1, 0, 0),
  ('platform', 'Leo Fischer', 'Site Reliability Engineer', 1, 0, 0),
  ('platform', 'Noor Haddad', 'Platform Engineer', 1, 0, 0),
  ('platform', 'Jun Park', 'QA Engineer', 1, 0, 0),
  ('backend', 'Diego Ramos', 'Tech Lead', 1, 0, 0),
  ('backend', 'Sofia Bianchi', 'Backend Engineer', 1, 0, 0),
  ('backend', 'Tariq Malik', 'Backend Engineer', 1, 0, 0),
  ('backend', 'Grace Owusu', 'Backend Engineer', 1, 0, 0),
  ('backend', 'Ken Ibarra', 'Backend Engineer', 1, 0, 0),
  ('solstice', 'Kristen Wang', 'Growth Lead', 0, NULL, 0),
  ('solstice', 'Jenny Shen', 'SEO & Content Strategist', 0, NULL, 0),
  ('solstice', 'Harshavardhini Gururaj', 'Paid Media Manager', 0, NULL, 0),
  ('solstice', 'Saloni Parekh', 'Lifecycle/CRM Marketer', 0, NULL, 0),
  ('solstice', 'Vicky Lin', 'Analyst', 0, NULL, 0),
  ('solstice', 'Harshini Sivachitravel', 'Referral & Partnerships Lead', 0, NULL, 0);
