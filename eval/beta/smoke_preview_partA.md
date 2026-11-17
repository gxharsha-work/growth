# Smoke test

23 of 23 checks pass against https://sprint9-beta.growth-3it.pages.dev (2026-11-17T03:37:20.228Z)

| Check | Result | Detail |
| --- | --- | --- |
| anonymous GET / is blocked | PASS | HTTP 302 |
| anonymous GET /index.html is blocked | PASS | HTTP 302 |
| anonymous GET /api/teams is blocked | PASS | HTTP 302 |
| anonymous GET /api/me is blocked | PASS | HTTP 302 |
| anonymous GET /api/health is blocked | PASS | HTTP 302 |
| anonymous GET /api/teams/solstice/signals is blocked | PASS | HTTP 302 |
| anonymous GET /api/teams/solstice/roster is blocked | PASS | HTTP 302 |
| anonymous DELETE /api/teams/solstice is blocked | PASS | HTTP 302 |
| anonymous PATCH /api/teams/solstice is blocked | PASS | HTTP 302 |
| anonymous POST /api/teams is blocked | PASS | HTTP 302 |
| anonymous POST /api/insight is blocked | PASS | HTTP 302 |
| signed in: GET /api/health reports ok | PASS | HTTP 200, {"d1":{"status":"ok","latencyMs":33},"workersAi":{"status":"bound"},"ingestion":{"status":"fresh","lastRun":"2026-11-17T03:13:27.017Z","ageHours":0.4}} |
| signed in: GET /api/me names the user | PASS | HTTP 200, role manager, admin true |
| signed in: /api/teams/platform/signals has no raw text | PASS | HTTP 200 |
| signed in: /api/teams/platform/buildings has no raw text | PASS | HTTP 200 |
| signed in: /api/teams/platform/roster has no raw text | PASS | HTTP 200 |
| signed in: /api/teams/backend/signals has no raw text | PASS | HTTP 200 |
| signed in: /api/teams/backend/buildings has no raw text | PASS | HTTP 200 |
| signed in: /api/teams/backend/roster has no raw text | PASS | HTTP 200 |
| signed in: /api/teams/solstice/signals has no raw text | PASS | HTTP 200 |
| signed in: /api/teams/solstice/buildings has no raw text | PASS | HTTP 200 |
| signed in: /api/teams/solstice/roster has no raw text | PASS | HTTP 200 |
| signed in: team page loads | PASS | HTTP 200, 747 bytes |
