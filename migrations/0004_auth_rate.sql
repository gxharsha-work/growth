-- Access control and rate limiting (P0 hardening).
--
-- role_assignments: maps a Cloudflare Access email to a role. Anyone
-- authenticated by Access but absent from this table gets 403.
-- rate_limits: fixed-window counters keyed by user or team (see _lib/ratelimit.ts).

CREATE TABLE role_assignments (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('manager', 'leadership'))
);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window)
);
