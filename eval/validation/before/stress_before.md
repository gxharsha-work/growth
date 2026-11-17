# Stress-test results (Growth API)

Code under test: `feature/p0-hardening` (the code before the Sprint 8 changes, checked out with `git worktree`). Real Hono app + real SQLite from the repo's migrations + mock Workers AI. **20 of 32 tests pass.**

| Group | Passed |
| --- | --- |
| Noisy / missing data | 2 / 5 |
| Unusual inputs | 3 / 6 |
| Model uncertainty and API failures | 5 / 7 |
| Increased load | 3 / 3 |
| Out-of-distribution cases | 3 / 3 |
| Security and misuse | 4 / 6 |
| Behaviour changes from Sprint 8 priority #1 | 0 / 2 |

| ID | Test | Pass criterion | Result | Detail |
| --- | --- | --- | --- | --- |
| A1 | Team with a single week of data | POST /insight returns 200 with status, signal and action | PASS | status 200 |
| A2 | Non-numeric signal values ("abc") | the unusable week is treated as missing (3 of 4 weeks served) and nothing non-numeric reaches the client | **FAIL** | HTTP 200, 4 weeks served, all numeric = false |
| A3 | Empty sprint (0 issues, 0-day cycle time) | is treated as missing data, not as a perfect cycle time | **FAIL** | week 3 jira source = live |
| A4 | One corrupt signal row in D1 | GET /signals still returns 200 with the good weeks | **FAIL** | HTTP 500, weeks n/a |
| A5 | Extreme values (cycle 99999 d, completion -40%) | returns a note that does not say healthy | PASS | HTTP 200, status "Worth investigating" |
| B1 | Malformed JSON body | POST /insight answers 400 as JSON | **FAIL** | HTTP 500, json=false |
| B2 | Bad week values (string, 1.5, -1, 0, 1e9, null) | every one answers 4xx, never 5xx | PASS | 400,400,404,404,404,400 |
| B3 | SQL-injection string as team id | answers 4xx and leaves the teams table intact | PASS | HTTP 404, teams 3 -> 3 |
| B4 | Team name of 100,000 characters | POST /teams answers 400 | **FAIL** | HTTP 201 |
| B5 | Whitespace-only and emoji team names | whitespace -> 400, emoji -> 201 | PASS | 400 / 201 |
| B6 | Prompt injection through the team name | the name never reaches the model prompt | **FAIL** | prompts captured: 1 |
| C2a | Model returns empty text | a valid template note is returned instead (200, source template) | PASS | HTTP 200, source template |
| C2b | Model returns garbage / markdown | a valid template note is returned instead (200, source template) | PASS | HTTP 200, source template |
| C2c | Model uses off-limits wording | a valid template note is returned instead (200, source template) | PASS | HTTP 200, source template |
| C2d | Model cites a real number on the wrong field | a valid template note is returned instead (200, source template) | PASS | HTTP 200, source template |
| C1 | Workers AI throws | answers 200 with the template note | PASS | HTTP 200, source template |
| C3 | Workers AI never answers (hang) | a template note is returned within 4 s | **FAIL** | threw: no response within 4 s |
| C5 | D1 database unavailable | answers with a JSON error body, no stack trace | **FAIL** | HTTP 500, json=false |
| D1 | 200 concurrent reads of /signals | all 200 OK | PASS | 200/200 ok in 32 ms |
| D2 | 40 concurrent coaching requests from one user (production limits) | exactly 10 allowed per hour, the rest refused | PASS | 10 allowed, 30 refused |
| D3 | 1,000 requests with random team ids from one user | rate-limit table growth stays bounded (< 50 rows) | PASS | 11 rows in rate_limits |
| E1 | Hand-tuned demo team asks for coaching | refused with 403 demo_data | PASS | HTTP 403 |
| E2 | Week beyond the available history | answers 404 | PASS | HTTP 404 |
| E3 | Brand-new team with no signal rows | coaching refused (demo data), no crash | PASS | create 201, insight 403 |
| F1 | Dev role bypass attempted in production | ignored: 401 | PASS | HTTP 401 |
| F2 | Read-only (leadership) role tries to write | POST /teams, DELETE and POST /insight all 403 | PASS | 403/403/403 |
| F3 | Eval endpoint in production | hidden: 404 | PASS | HTTP 404 |
| F4 | Raw ticket titles and event titles in /signals | never returned | PASS | HTTP 200, body 338 bytes |
| F5 | Malformed access token in production | answers 401 (not a 500) | **FAIL** | HTTP 500 |
| F6 | Access key server unreachable while verifying a token | fails closed with 401 or 503 as JSON | **FAIL** | HTTP 500, json=false |
| G1 | Healthy live team asks for coaching | status "Looks healthy", model not called | **FAIL** | status "Looks healthy, stable", model calls 1 |
| G2 | Chronically low, flat live team | is not called healthy | **FAIL** | status "Looks healthy, stable" |
