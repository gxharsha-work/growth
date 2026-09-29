# Deploying Growth to Cloudflare (free tier only)

Two Cloudflare projects share one D1 database:

- **`growth`** (Cloudflare Pages) — the frontend (`dist/`) plus the REST API
  (`functions/api/`), served together from the same domain.
- **`growth-ingestion`** (a Worker, in `worker-ingestion/`) — a daily Cron
  Trigger that pulls fresh Jira + Calendar data into D1, replacing the old
  `npm run ingest:jira` / `npm run ingest:calendar` local scripts.

Everything below uses free-tier Cloudflare products only: Pages, Workers,
D1, and Cron Triggers.

## 0. Log in once

```
npx wrangler login
```

## 1. Create the shared database

```
npx wrangler d1 create growth-db
```

This prints a `database_id`. Paste it into **both** `wrangler.toml` (repo
root) and `worker-ingestion/wrangler.toml`, replacing
`REPLACE_AFTER_WRANGLER_D1_CREATE` in each.

## 2. Run migrations against the real (remote) database

```
npx wrangler d1 migrations apply growth-db --remote
```

This creates the schema and seeds the three demo teams (Platform, Backend,
Solstice) with their starter buildings and Solstice's real ingested
signals — the same seed data the app has shipped with locally.

(`--local` instead of `--remote` runs entirely on your machine with no
Cloudflare account needed at all — useful for testing changes before they
touch the real database. That's what building this backend was verified
against.)

## 3. Deploy the frontend + API (Cloudflare Pages)

```
npm run build
npx wrangler pages deploy dist --project-name=growth
```

First deploy creates the Pages project and prints its URL
(`https://growth.pages.dev` or similar). No secrets needed here — the API
only reads/writes D1, which is bound via `wrangler.toml`.

## 4. Get a Google Calendar refresh token (one-time, local)

The ingestion Worker needs a long-lived refresh token. Getting one still
requires an interactive OAuth flow, so this one step happens on your
machine, not in the Worker:

```
npm run auth:calendar
```

(Needs `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET` in your
local `.env` — the **Desktop app** OAuth client, not the web one used by
"Connect your Google Calendar" in the browser.) This writes
`.google-calendar-token.json` locally — open it and copy the
`refresh_token` value for the next step.

## 5. Configure and deploy the ingestion Worker

```
cd worker-ingestion
npx wrangler secret put MY_ATLASSIAN_TOKEN
npx wrangler secret put GOOGLE_CALENDAR_CLIENT_SECRET
npx wrangler secret put GOOGLE_CALENDAR_REFRESH_TOKEN   # from step 4
```

Then edit `worker-ingestion/wrangler.toml`'s `[vars]` block: fill in
`JIRA_EMAIL` and `GOOGLE_CALENDAR_CLIENT_ID` (not secrets — safe as plain
vars), and confirm `PILOT_TEAM_ID`/`JIRA_SITE_URL`/`JIRA_BOARD_ID` are
right for whichever team you're piloting.

```
npx wrangler deploy
```

It'll now run automatically once a day (see `[triggers]` in that
`wrangler.toml`). To confirm it works without waiting for the schedule:

```
curl https://growth-ingestion.<your-subdomain>.workers.dev
```

(printed by `wrangler deploy`) — this manually runs the same ingestion and
returns a log of what happened.

## Updating later

- Frontend/API change: `npm run build && npx wrangler pages deploy dist --project-name=growth`
- Ingestion Worker change: `cd worker-ingestion && npx wrangler deploy`
- Schema change: add a new `migrations/000N_*.sql` file, then
  `npx wrangler d1 migrations apply growth-db --remote`

## What's intentionally not here yet

- **GitHub ingestion** (FR2) — not built. `github` signals are still a
  neutral placeholder everywhere.
- **Auth / access control** — the deployed link is open to anyone who has
  it, by explicit choice for this pass. Cloudflare Access (free up to 50
  users) is the natural next step whenever that's wanted.
- **AI-generated coaching suggestions** (FR10) — deferred; the composite
  score stays deterministic and fully client-computable, matching the
  architecture doc's "AI layer is an enhancement, not a dependency."
- **Per-team integration setup** — `worker-ingestion` is single-tenant
  today (one Jira board, one calendar, configured via `wrangler.toml`
  `[vars]`). Multiple pilot teams each connecting their own Jira/Calendar
  through the UI is a real fast-follow, not attempted here.
