# Runbook

Everything runs on one Cloudflare account. Use Node 22.5 or later, and `npx wrangler` from the repo root.

| Piece | Name |
| --- | --- |
| Pages project (site + API) | `growth`, at `growth-3it.pages.dev` |
| D1 database | `growth-db` (`ce889c2f-cd60-4182-83a2-7bac95d5289c`) |
| Ingestion Worker (daily cron, 13:00 UTC) | `growth-ingestion` |
| Access application | "Growth beta", team domain `growth-cmu.cloudflareaccess.com` |

## Deploy

1. Check everything locally: `npm run check` (lint, type-checks, build, tests).
2. Apply any new migration: `npx wrangler d1 migrations apply growth-db --remote`.
3. Deploy a preview: `npm run build && npx wrangler pages deploy dist --project-name=growth --branch=sprint9-beta --commit-hash=$(git rev-parse HEAD)`.
4. Smoke-test the preview: `CF_AUTHORIZATION=<cookie> node scripts/smoke-test.mjs https://sprint9-beta.growth-3it.pages.dev`. Copy the `CF_Authorization` cookie from the browser after signing in.
5. Promote to production by deploying the same build with `--branch=main`, then rerun the smoke test against `https://growth-3it.pages.dev`.
6. Ingestion Worker: `cd worker-ingestion && npx wrangler deploy`.

Build from a clean commit. The footer shows `build <sha>+` if the tree had uncommitted changes.

## Roll back

- **Site:** Dashboard > Workers & Pages > growth > Deployments. Pick the last good deployment and choose "Rollback to this deployment".
- **Worker:** `npx wrangler deployments list --name growth-ingestion`, then `npx wrangler rollback <version-id> --name growth-ingestion`.

## Restore D1 (Time Travel)

D1 keeps point-in-time history: 7 days on the Workers Free plan, 30 days on Workers Paid.

1. Find a bookmark: `npx wrangler d1 time-travel info growth-db --timestamp=2026-11-17T03:00:00Z`.
2. Restore: `npx wrangler d1 time-travel restore growth-db --bookmark=<bookmark>`.
3. Take a manual backup before risky changes: `npx wrangler d1 export growth-db --remote --output=backup.sql`. Keep it outside the repo.

## Access and roles

- Allow someone to sign in: Zero Trust > Access > Applications > Growth beta > Policies > "Growth team", then add their email.
- Give them a role (without one, they get 403):
  `npx wrangler d1 execute growth-db --remote --command "INSERT INTO role_assignments (email, role) VALUES ('name@example.edu', 'leadership')"`.
  Use `manager` for a team lead.
- Make someone an admin: `npx wrangler pages secret put ADMIN_EMAILS --project-name growth -e production`. Enter a comma-separated list, then repeat with `-e preview`.

## Rotate secrets

| Secret | Where | How |
| --- | --- | --- |
| Jira API token | Worker `MY_ATLASSIAN_TOKEN` | Create a new token at id.atlassian.com, run `npx wrangler secret put MY_ATLASSIAN_TOKEN` in `worker-ingestion/`, then revoke the old one. |
| Google Calendar refresh token and client secret | Worker `GOOGLE_CALENDAR_REFRESH_TOKEN`, `GOOGLE_CALENDAR_CLIENT_SECRET` | Run `npm run auth:calendar` locally for a new refresh token, then `npx wrangler secret put` each one. |
| Admin list | Pages secret `ADMIN_EMAILS` | See above. |
| Access sessions | Zero Trust | Access > Applications > Growth beta > "Revoke existing tokens". |

Secrets live only in Cloudflare and in a local, git-ignored `.env`. They are never stored in the repo or the browser.

## Reset the demo teams

`node scripts/reset-demo.mjs` prints the SQL. Add `--remote` to apply it. This restores Platform and Backend to their seeded state and leaves the live Solstice team alone.

## Check health

Open `/api/health` while signed in. If `ingestion.status` is `stale`, check Workers Logs for `growth-ingestion`; Jira and calendar failures are logged per source.
