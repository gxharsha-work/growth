# Growth API

All routes live under `https://growth-3it.pages.dev/api/` and are served by Cloudflare Pages Functions (`functions/api/_lib/app.ts`).

## Authentication and roles

- **Cloudflare Access** stands in front of the whole site. A visitor signs in with a one-time PIN sent to an allowed email.
- Access adds a signed token (`Cf-Access-JWT-Assertion`) to every request. The API checks its RS256 signature, audience, issuer and expiry (`_lib/auth.ts`).
- **Roles:**

| Role | Who | Can do |
| --- | --- | --- |
| `leadership` | Email listed in D1 `role_assignments` | Read everything. Send feedback. |
| `manager` (team lead) | Email listed in D1 `role_assignments` | Everything leadership can, plus edit villages and cohort tags, record consent, import rosters, get AI coaching. |
| admin | Email in the `ADMIN_EMAILS` secret | Everything a manager can, plus rename and delete teams, and read feedback. |

- Status codes: **401** not signed in or a bad token. **403** signed in without the needed role. **503** the Access key server could not be reached (fails closed).
- Every response is JSON with `Cache-Control: no-store`. Errors look like `{"error": "..."}` and never include a stack trace.

## Endpoints

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/api/me` | any | Who is signed in: email, role, isAdmin |
| GET | `/api/health` | any | D1, Workers AI binding, last ingestion, build SHA |
| GET | `/api/teams` | any | List teams with cohort tags |
| POST | `/api/teams` | manager | Create a team (`name`, optional `sizeBucket`, `functionType`) |
| PATCH | `/api/teams/:id` | manager (rename: admin) | Edit cohort tags or capabilities; renaming needs admin |
| DELETE | `/api/teams/:id` | admin | Delete a team and its buildings |
| GET | `/api/teams/:id/buildings` | any | Village buildings |
| POST | `/api/teams/:id/buildings` | manager | Add a building |
| PATCH | `/api/buildings/:id` | manager | Rename, move or annotate a building |
| DELETE | `/api/buildings/:id` | manager | Remove a building |
| GET | `/api/teams/:id/signals` | any | Weekly team-level signals, their sources, and consent status |
| GET | `/api/teams/:id/roster` | any | Roster members and consent coverage |
| PATCH | `/api/roster/:memberId` | manager | Record a member's opt-in or withdrawal |
| POST | `/api/teams/:id/roster/import` | manager | Import a roster CSV (all or nothing) |
| POST | `/api/insight` | manager | One coaching note for a team and week |
| POST | `/api/feedback` | any | "Report an issue" |
| GET | `/api/feedback` | admin | Read reports |
| POST | `/api/eval/insight` | dev only | Evaluation harness. Returns 404 in production |

## Examples

**GET /api/me**
```json
{ "email": "lead@example.edu", "role": "manager", "isAdmin": false }
```

**GET /api/health**
```json
{ "status": "ok",
  "checks": { "d1": { "status": "ok", "latencyMs": 33 },
              "workersAi": { "status": "bound" },
              "ingestion": { "status": "fresh", "lastRun": "2026-11-17T03:13:27.017Z", "ageHours": 0.4 } },
  "build": { "sha": "530f667...", "version": "0.9.0-beta" } }
```
`status` is `ok`, `degraded` (AI binding missing, or data older than 36 h) or `down` (HTTP 503, D1 unreachable).

**GET /api/teams/:id/signals** (one week shown)
```json
{ "weeks": [ { "week": 1, "period": { "kind": "sprint", "name": "SCRUM Sprint 0" },
               "jira": { "issueCount": 6, "avgCycleTimeDays": 4, "sprintCompletionPct": 17 },
               "github": { "prCount": 0, "avgReviewTurnaroundHours": 12, "pctCommitsAfter7pm": 15 },
               "calendar": { "avgMeetingHoursPerWeek": 6 },
               "sources": { "jira": "live", "github": "placeholder", "calendar": "live" } } ],
  "source": "live",
  "consent": { "total": 6, "consented": 3, "minConsented": 3, "scoreAllowed": true } }
```
- Only team-level numbers are returned. Ticket summaries and event titles never are.
- A source marked `placeholder` is left out of the score.
- When fewer than 3 members of a live team have opted in, the response is `{"weeks": [], "withheld": "consent_required", "consent": {...}}`.

**POST /api/teams/:id/roster/import**
```json
{ "csv": "name,role,team,consented\nAlex Kim,Engineer,solstice,yes\n" }
```
- Returns `{"imported": 1, "members": [...], "consent": {...}}`.
- On any bad row, nothing is written: `400 {"error": "csv has errors; nothing was imported", "errors": [{"line": 2, "message": "team \"backend\" is not this team"}]}`.

**POST /api/insight**
```json
{ "teamId": "solstice", "week": 4 }
```
```json
{ "status": "Worth investigating",
  "signal": "Biggest contributor to the drop: Cycle time (6.4d), higher than Peer team Y's 3.6d.",
  "action": "Limit work in progress so items finish before new ones start.",
  "source": "model", "dataSource": "live" }
```
- The status, numbers and peer comparison are computed in code. The model writes only the `action`.
- `source` is `template` when the model is skipped (healthy week), fails, times out (8 s) or writes something the validator rejects.

| Refusal | Code | Meaning |
| --- | --- | --- |
| `demo_data` | 403 | Coaching runs on live teams only |
| `consent_required` | 403 | Fewer than 3 members opted in |
| `not_enough_data` | 422 | Under 40% of the score's signals have data this week |
| rate limit | 429 | 10 notes per user per hour, 30 per team per day (`Retry-After` header) |
| `coaching_unavailable` | 502 | Unexpected failure; the score and signals are unaffected |
