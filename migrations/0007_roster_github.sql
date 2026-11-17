-- GitHub identity mapping for the roster (FR2, FR4 "GitHub handle").
-- Comma-separated GitHub logins per member. The ingestion Worker counts a
-- PR or commit only when its author maps to a member who has opted in, and
-- stores team-level totals only (never logins or per-person numbers).
ALTER TABLE roster_members ADD COLUMN github_logins TEXT NOT NULL DEFAULT '';

UPDATE roster_members SET github_logins = 'gxharsha20,gxharsha-work' WHERE team_id = 'solstice' AND name = 'Harshavardhini Gururaj';
UPDATE roster_members SET github_logins = 'KristennnnW' WHERE team_id = 'solstice' AND name = 'Kristen Wang';
