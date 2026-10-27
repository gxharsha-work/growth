# Handoff — AI coaching, Cloudflare deployment and open work

**For:** the teammate taking over the AI coaching layer and the Cloudflare side.
**State at handoff:** everything below was built and verified **offline** (no Cloudflare access). Nothing from branches `feature/p0-hardening` or `feature/evidence-driven-improvements` has been deployed, so the live site still runs the Sprint 5 code. Section 4 is your checklist; section 3 says what is and is not verified.

---

## 1. Where things are

| Branch | What it holds | Status |
| --- | --- | --- |
| `main` @ `55838d6` | Sprint 5 code (the currently deployed version) | unchanged since 2026-09-29 |
| `feature/p0-hardening` | The four P0 fixes from the Week 5 report, plus sprint-boundary alignment and the UI polish (sprout coach, island colour) — 7 commits | **pushed** to `origin`; no PR opened yet |
| `feature/evidence-driven-improvements` | Sprint 8 work on top of the branch above: coaching integrity, API robustness, evaluation harness with before/after evidence, a Jira data refresh | local commits, **not pushed** |

Suggested merge order: open the PR for `feature/p0-hardening` first, review and deploy it, then open the second branch as a stacked PR. The Solstice score changing from 61 to 57 in the P0 branch is **intentional** (placeholder GitHub is excluded from the score and the weights are rescaled).

## 2. What changed, and why (do not undo these without reading the reason)

| Change | Where | Why |
| --- | --- | --- |
| The note's **status is derived in code** from the early-warning flag, the trend and the absolute score. The model no longer writes it. | `facts.ts` (`deriveStatus`), `template.ts` | Sprint 5 measured the live model raising concern on 58 of 60 healthy weeks (97%). P0-3 still let the model write STATUS; replaying the recorded outputs through that pipeline still showed 95% false concern. |
| **Healthy weeks never call the model** (template note, "No action needed — keep monitoring."). | `coaching.ts` (`generateCoachingNote`) | Same evidence. Also cuts model calls (80 → 20 on the replay). Product behaviour change: healthy teams only ever see "Auto-generated note". |
| The model writes **one `ACTION:` line only**. | `FACT_SYSTEM_PROMPT` in `coaching.ts` | Removes the model's ability to contradict the status or reverse a comparison. |
| **Numbers are checked field-to-value**: a number must sit next to a signal name and equal that signal's value. | `validate.ts` | The old check accepted any number present anywhere in the evidence: 8.7% of random integers passed, and real values attached to the wrong field passed 100%. |
| The **team name is not sent to the model**. | `buildFactPrompt` in `facts.ts` | User-chosen text inside a prompt is an injection surface; the model does not need it. |
| `"drop"` only appears in the signal line when the status is a concern. | `signalSentence` in `facts.ts` | 95% of "healthy" notes used to say "Biggest contributor to the drop". |
| **8-second timeout** on the model call (`AI_TIMEOUT_MS`), falling back to the template. | `coaching.ts` | A hung model call used to hang the request forever. |
| API returns **JSON errors only**, validates field lengths, and fails closed (401/503) on a bad or unverifiable access token. | `app.ts`, `auth.ts` | Bad JSON, a dead database and malformed tokens used to produce non-JSON 500s. |
| Unreadable or non-numeric signal rows are **skipped**, and a sprint with 0 issues is **missing data**, not a "perfect" 0-day cycle time. | `signals.ts`, mirrored in `src/data/mockSignals.js` | A single corrupt row made the whole endpoint 500; non-numeric values could score as healthy. |
| Jira signals are **one row per sprint**, keyed by sprint dates. | `scripts/jira-ingest.js`, `worker-ingestion/src/{jira,index}.ts`, `src/data/sprintAlign.js` | Metrics were being stamped onto whatever ISO week the ingest ran in. |

## 3. Verified vs not verified

**Read this first: no Workers AI call was made in this work.** The author had no Cloudflare credentials, so everything below tests the code *around* the model, not the model itself:

- **Real model behaviour** enters only through the **recorded Sprint 5 outputs** (`eval/results.csv`, 170 live-model calls made earlier on the deployed endpoint). `replay-sprint5.mjs` feeds them through the old and the new pipeline. Those outputs came from the *old* prompt.
- **Everything else uses a mock model** (`stress-test.mjs`, `test-facts-validate.mjs`) that returns what the test asks for: empty text, garbage, off-limits wording, a hang. That is the right tool for failure handling, and it says nothing about what the live model writes.
- Some "after" numbers are true **by construction**, not because the model improved: the status now comes from code, so "status agrees with the flag" is 100% by definition. The gain is that the model can no longer decide it.
- So the accurate claim is: *the guard rails around the AI are tested and improved; the AI's own output under the new prompt has not been measured.* Section 4.6 is how to measure it.

**Verified offline** (re-run any time; commands in section 5):

| Check | Before | After |
| --- | --- | --- |
| Low-score weeks (<45) called "healthy" | 73.7% | 0% |
| "Healthy" notes that say "drop" | 94.7% | 0% |
| Random integers accepted by the number check | 8.7% | 0% |
| Real value attached to the wrong field accepted | 100% | 0% |
| Real Sprint 5 model outputs replayed: healthy weeks shown as a concern | 95.0% (57/60) | 0% |
| Replay: model calls made | 80 | 20 |
| API stress suite (32 tests, real Hono app + real SQLite from the migrations) | 20 / 32 | 32 / 32 |

**NOT verified — needs Cloudflare:**

- The **new prompt on the live model**: does it return exactly one `ACTION:` line, how often does the validator reject it (→ template fallback), is the action useful. The replay only exercises the code *around* the model, because the recorded outputs came from the old prompt.
- **Cloudflare Access** token verification against real keys, and the role table.
- **D1 concurrency** for the rate limiter (tested against SQLite, whose locking differs).
- The **sprint-aligned worker** writing to D1.

## 4. Your checklist (in order)

### 4.1 Deploy the branches
```bash
nvm use 22                                   # wrangler needs Node 22 (the repo's .nvmrc is 20)
git checkout feature/evidence-driven-improvements
npm install && npm run build
npx wrangler pages deploy dist --project-name=growth
```

### 4.2 Database
```bash
npx wrangler d1 migrations list  growth-db --remote
npx wrangler d1 migrations apply growth-db --remote      # applies 0004: role_assignments + rate_limits
```

### 4.3 Auth (Cloudflare Access) — not configured yet
1. Zero Trust → Access → create a **self-hosted application** for the Pages domain (confirm the real domain; the eval script defaults to `growth-3it.pages.dev`). Policy: the team's emails.
2. Copy the **Application Audience (AUD) tag** and the **team domain** (`<team>.cloudflareaccess.com`).
3. Pages → Settings → Environment variables, **Production**:

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | the AUD tag |
| `AI_TIMEOUT_MS` | optional, default `8000` |

   **Never set `DEV_AUTH_ROLE` in Production** — it is a login bypass. It is ignored when `ENVIRONMENT=production`, but do not rely on that.
4. Give people a role (without a row a signed-in user gets 403):
```bash
npx wrangler d1 execute growth-db --remote --command \
 "INSERT INTO role_assignments (email, role) VALUES ('lead@example.com','manager'), ('boss@example.com','leadership');"
```
   `manager` can read and write and may call the AI; `leadership` is read-only.

### 4.4 Redeploy the ingestion worker, then clean legacy rows
```bash
cd worker-ingestion && npx wrangler deploy
curl <worker url>                              # runs one ingestion and prints the log
```
**Pitfall.** `signals.ts` uses the sprint-aware merge only when **every** Jira row carries a `sprint` field. If the daily cron has been writing rows in the old format, they remain next to the new ones and the merge silently falls back to the old week-based behaviour. After the first new ingestion run:
```bash
npx wrangler d1 execute growth-db --remote --command \
 "SELECT iso_week, substr(payload,1,60) FROM signal_weeks WHERE team_id='solstice' AND source='jira' AND payload NOT LIKE '%\"sprint\"%';"
# if it returns rows:
npx wrangler d1 execute growth-db --remote --command \
 "DELETE FROM signal_weeks WHERE team_id='solstice' AND source='jira' AND payload NOT LIKE '%\"sprint\"%';"
```
(The sprint that starts in ISO week 2026-W38 overwrites the old W38 row by itself; other old weeks do not.)

### 4.5 Smoke tests after deploy
Sign in through the browser first, then check:

| Action | Expected |
| --- | --- |
| `GET /api/me` | your email and role |
| Manager: `POST /api/insight {"teamId":"solstice","week":1}` | 200 with `status`, `signal`, `action`, `source` |
| Same for `platform` | 403 `demo_data` |
| Leadership: `POST /api/teams` | 403 |
| 11th `/api/insight` within an hour, same user | 429 with `Retry-After` |
| `GET /api/teams/solstice/signals` | no `summary`, `title` or `details` anywhere in the body |
| `POST /api/eval/insight` | **404** in production |
| A request with no Access cookie | blocked by Access before it reaches the app |

### 4.6 Re-measure the AI on the live model (the main open item)
Why the old harness is not enough: `scripts/evaluate-coaching.mjs` calls `POST /api/eval/insight`, which (a) is hidden in production on purpose and (b) runs the **old** prompt through `buildPrompt`. It never executes `generateCoachingNote`, so it cannot measure the new pipeline.

Minimal change to make it measurable:
1. In `functions/api/_lib/app.ts`, next to `/eval/insight` (it is already behind the production guard), add `POST /eval/note` taking `{ evidence }` and returning `generateCoachingNote(c.env.AI, evidence)` plus `latencyMs`.
2. In `scripts/evaluate-coaching.mjs`, add a config `E` that posts each of the 16 Platform/Backend team-weeks (its evidence builders already exist) to `/eval/note`, 5 runs each.
3. Run it against a **Preview** deployment where `ENVIRONMENT` is not `production` and `DEV_AUTH_ROLE=manager` is set (otherwise Access and the rate limit block 80 calls).
4. Record: share of notes with `source:"model"`, validator rejection rate (fallbacks), p50/p95 latency, 3-run consistency (temperature 0 should make runs identical), and a blind template-vs-model preference (a teammate scores them). By construction false concern on healthy weeks should be 0; confirm it.

Decision rule already adopted: keep the model-written action **only if** it passes the faithfulness checks **and** wins a blinded comparison against the template; otherwise ship the template.

Cost note: about 7 Workers AI neurons per note (free tier 10,000/day); healthy weeks no longer use any.

## 5. Running everything locally

```bash
nvm use 20 && npm install
npm run dev                                   # offline preview; /api/insight is a dev-only mock (see 8)
npm run lint
./node_modules/.bin/tsc --noEmit
(cd worker-ingestion && ../node_modules/.bin/tsc --noEmit -p tsconfig.json)

node scripts/test-facts-validate.mjs          # coaching logic, 36 checks
node scripts/test-sprint-align.mjs            # 15
node scripts/test-scoring-parity.mjs          # server and browser scorers agree

nvm use 22
node --no-warnings scripts/stress-test.mjs    # 32 API tests; needs Node >= 22.5 (node:sqlite)
node scripts/validation/simulate.mjs --set=both      # seeded early-warning evaluation (E2)
node scripts/validation/faithfulness.mjs             # coaching-layer checks (E2b)
node scripts/validation/replay-sprint5.mjs           # real Sprint 5 model outputs through the pipeline
node scripts/validation/persignal.mjs --final --k=1.5 --h=14   # per-signal CUSUM experiment
```
Reproducing a "before" number: `git worktree add --detach /tmp/old feature/p0-hardening && ln -s "$PWD/node_modules" /tmp/old/node_modules`, then pass `--lib=/tmp/old/functions/api/_lib` (faithfulness, replay) or `--root=/tmp/old` (stress test). Outputs are written under `eval/validation/{before,after}/`.

`wrangler pages dev` needs a `CLOUDFLARE_API_TOKEN` for the AI binding, which is why the full local backend was never run here. Copy `.dev.vars.example` to `.dev.vars` for local runs.

## 6. Known open issues (most important first)

1. **Raw ticket and event titles ship in the front-end bundle.** `src/data/jiraSignals.generated.json` and `calendarSignals.generated.json` contain per-issue `summary` and per-event `title` and are imported by `mockSignals.js`. The API strips them, the bundle does not. Fix: drop `details` in the ingest scripts before writing the files (and stop importing them in production). This is the main remaining privacy gap.
2. **The AI is unmeasured after P0** (section 4.6).
3. **Cycle time reads ~0 days on the refreshed Jira data.** Jira timestamps are real-time and the board was populated in one sitting, so issues finished "in minutes". It becomes realistic only as issues move over several days.
4. **Calendar signal covers one week** (2026-W38). The October sprint shows the meeting load as a placeholder and excludes it from the score.
5. **GitHub is still a placeholder** (excluded from the score). Without it, review-bottleneck strain is nearly invisible (recall 65% → 15% in the seeded evaluation).
6. **The early-warning rule is a "big drops only" detector** (recall 43% on held-out seeded strain, 26% for subtle) and fires on 55% of benign events (holidays, planned hardening sprints). A per-signal CUSUM candidate raised subtle recall to 51% (95% CI 43–58%) but delayed detection from 1 to 3 weeks and raised benign fires to 68%; it was **not shipped** (`scripts/validation/persignal.mjs`, `eval/validation/after/persignal_heldout.md`).
7. **Human validation has not been run** (expert content-validity panel, blinded note comparison). A third, independently written scenario library is still needed (`scripts/validation/scenarios.mjs`: only the `HELDOUT` data changes).
8. `eval/validation/e5_answer_key.json` is the answer key for the expert sessions: do not hand it to participants.

## 7. Jira board (the data source for the live team)

Project `SCRUM` ("Growth Project Board", a fictional Solstice Outdoors marketing team), 33 issues, all six team members assigned work.

| Sprint | Dates | State | Issues | Completion / cycle (as ingested) |
| --- | --- | --- | --- | --- |
| SCRUM Sprint 0 | 2026-09-15 → 09-29 | closed | 6 | 17% / 4 d |
| Sprint 1 - Tracking & Referral | 2026-10-13 → 10-27 | active | 17 | 41% / 0 d |
| Sprint 2 - Content & Insights | 2026-10-27 → 11-10 | future | 5 | — |

The ingest (`npm run ingest:jira`, or the worker) reads this board, so editing it changes the app. Jira limits: sprint names must be shorter than 30 characters; a sprint stays "active" past its end date until someone completes it.

## 8. Not in the commit history

- **`vite.config.js` dev mock** (local only). `npm run dev` has no backend, so a Vite middleware answered `/api/insight` using the real `facts.ts` and `template.ts`. It is not committed; if you want the same offline preview, re-create it (it is about 60 lines, `apply: 'serve'`, so it can never reach a production build).
- **`report/`** (Week 5/7 reports, the validation write-ups) and `.claude/` are untracked on purpose.
- The one-off scripts that populated Jira were not kept.

## 9. File map

| Path | Purpose |
| --- | --- |
| `functions/api/_lib/app.ts` | All API routes, auth middleware, error handling |
| `functions/api/_lib/{facts,template,validate,coaching}.ts` | Coaching pipeline (status, ranking, wording check, model call) |
| `functions/api/_lib/{auth,ratelimit,evidence,signals,scoring}.ts` | Access/JWT, rate limiting, server-side evidence, signal merge, score |
| `src/logic/healthScore.js`, `src/data/mockSignals.js` | Browser scorer and data merge (must stay identical to the server copies; `test-scoring-parity.mjs` checks the scorer) |
| `worker-ingestion/` | Daily Cron Worker: Jira + Google Calendar into D1 |
| `migrations/0004_auth_rate.sql` | `role_assignments`, `rate_limits` |
| `scripts/stress-test.mjs` | API robustness suite |
| `scripts/validation/` | Seeded evaluation, faithfulness, replay and per-signal experiment |
| `eval/validation/` | Generated evidence; `before/` and `after/` hold the comparable pairs |
| `DEPLOY.md`, `.dev.vars.example` | Original deploy steps and local env template |
