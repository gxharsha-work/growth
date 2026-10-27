# Handoff — AI coaching, Cloudflare deployment and open work

**For:** the teammate taking over the AI coaching layer and the Cloudflare side.
**State at handoff:** the code was built and tested offline with a mock model, and the new coaching pipeline was then **measured on the real Workers AI model** with a Cloudflare token (section 3b), which found and fixed a reply-parsing bug. Nothing from branches `feature/p0-hardening` or `feature/evidence-driven-improvements` has been *deployed*, so the live site still runs the Sprint 5 code. Section 3 says exactly what is and is not verified; section 4 is your checklist.

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
| A **coaching playbook** gives each signal one concrete, outcome-linked next step; the model is told to adapt it, and replies that only suggest a meeting or discussion are refused. | `playbook.ts`, `isVagueFiller` in `validate.ts`, `buildFactPrompt` in `facts.ts`; sources in `docs/reference-skills/` | Live runs showed generic "schedule a meeting" advice. The steps paraphrase third-party practitioner guidance (not validated research); see the README there. |
| `"drop"` only appears in the signal line when the status is a concern. | `signalSentence` in `facts.ts` | 95% of "healthy" notes used to say "Biggest contributor to the drop". |
| **8-second timeout** on the model call (`AI_TIMEOUT_MS`), falling back to the template. | `coaching.ts` | A hung model call used to hang the request forever. |
| API returns **JSON errors only**, validates field lengths, and fails closed (401/503) on a bad or unverifiable access token. | `app.ts`, `auth.ts` | Bad JSON, a dead database and malformed tokens used to produce non-JSON 500s. |
| Unreadable or non-numeric signal rows are **skipped**, and a sprint with 0 issues is **missing data**, not a "perfect" 0-day cycle time. | `signals.ts`, mirrored in `src/data/mockSignals.js` | A single corrupt row made the whole endpoint 500; non-numeric values could score as healthy. |
| Jira signals are **one row per sprint**, keyed by sprint dates. | `scripts/jira-ingest.js`, `worker-ingestion/src/{jira,index}.ts`, `src/data/sprintAlign.js` | Metrics were being stamped onto whatever ISO week the ingest ran in. |

## 3. Verified vs not verified

**How this was tested.** The work was first built and tested with no Cloudflare access, using a mock model. Later a Cloudflare API token became available and the **new pipeline was measured on the real Workers AI model** (section 3b). That live run found a bug the mock tests had hidden (below), which is now fixed.

**Why that bug was invisible offline.** The mock model returned replies in exactly the format the prompt asks for, so the tests could not fail: they were written to agree with the code. The real model answers with just the sentence and no `ACTION:` label, so the first live run accepted **0 of 51** replies and every note silently fell back to the template. The parser is now tolerant (`parseAction`), and there are unit tests for unlabelled, bulleted, quoted, multi-line and empty replies.

### 3a. Verified offline (re-run any time; commands in section 5)

| Check | Before | After |
| --- | --- | --- |
| Low-score weeks (<45) called "healthy" | 73.7% | 0% |
| "Healthy" notes that say "drop" | 94.7% | 0% |
| Random integers accepted by the number check | 8.7% | 0% |
| Real value attached to the wrong field accepted | 100% | 0% |
| Real Sprint 5 model outputs replayed: healthy weeks shown as a concern | 95.0% (57/60) | 0% |
| Replay: model calls made | 80 | 20 |
| Raw ticket summaries / event titles in the data files and the built front-end bundle (`node scripts/test-no-raw-text.mjs`, `grep` of `dist/assets`) | 29 found / bundle contains ticket text | 0 / 0 |
| API stress suite (32 tests, real Hono app + real SQLite from the migrations, mock model) | 20 / 32 | 32 / 32 |

Some "after" numbers are true **by construction**, not because the model improved: the status now comes from code, so "status agrees with the flag" is 100% by definition. The gain is that the model can no longer decide it. The replay's "notes whose wording came from the model" fell from 25% to 3.8% after the final guard was added; that figure describes the *old* Sprint 5 prompt's outputs and is not meaningful for the new prompt (use 3b).

### 3b. Measured on the live model (`scripts/validation/live-model-eval.mjs`, 51 real calls per run)

Real `@cf/meta/llama-3.1-8b-instruct-fp8` on Workers AI, called through the production `generateCoachingNote`, 17 non-healthy cases x 3 runs (the 16 real Platform/Backend team-weeks plus seeded profiles at weeks 5 and 8). The 19 healthy cases correctly made **0** model calls in every run. Four runs, each exposing something:

| Run | What changed | Note shown is model-written | Replies starting "Schedule a ..." | Distinct replies |
| --- | --- | --- | --- | --- |
| 1 | New one-line prompt, parser required an `ACTION:` label | **0%** (parser bug) | n/a | n/a |
| 2 | Parser accepts an unlabelled line; reply must address the decided signal | 70.6% | **36 / 51** | 17 |
| 3 | Added the coaching playbook (below) | 35.3% (my topic check was too strict) | 0 | 11 |
| 4 (final) | Topic check matches on-topic vocabulary; length limit aligned with the prompt | **88.2%** | **0** | 9 |

Final run: 100% usable single-line replies; 11.8% fall back to the template (all because the model invented a number, e.g. "reduce capacity to 80%", which is also wrong advice); vague "meeting or discussion" filler 0%; 100% identical across the 3 runs of a case; latency p50 about 1.4 s. Files: `eval/validation/after/live_model_*` (final), `eval/validation/before/live_model_eval_run{1,2,3}_*.md` (earlier runs).

**What the runs taught (read before trusting any number):**

- **Run 1** was my bug. The offline tests could not see it because the mock model returned the format the prompt asked for.
- **Run 2** showed the quality problem: generic "Schedule a meeting with the team to discuss ..." for 36 of 51 replies, including for meeting-load problems.
- **Run 3** was my validator being too strict: it demanded the literal signal name, so it rejected on-topic advice such as "limit work in progress" for cycle time. A drop in an acceptance rate can be the guard, not the model.
- **The fix for run 2 came from the skills in `docs/reference-skills/`**, via `functions/api/_lib/playbook.ts`: one concrete move per signal, used as the template step, as grounding in the prompt, and as the bar the validator enforces (`isVagueFiller`). Example for meeting load: before, "Schedule a meeting with the team to discuss ... meeting load expectations"; after, "Audit recurring meetings to ensure they produce decisions and actions, and shorten or cancel those that do not, requiring an agenda and an owner."
- **The model now mostly rewords the playbook step.** Of 15 model-written notes, 1 was word-for-word a playbook step and 6 overlapped it by 60% or more (median 0.50). The specificity comes from the playbook, not from the model; the model's contribution is wording that fits the situation, and occasionally a time frame ("this sprint"). Whether that is worth a model call is exactly what the blinded comparison should decide.
- **Attribution was corrected while writing the README:** my first search wrongly credited the review-SLA idea to `vpe-advisor/SKILL.md`; the real sources are `vpe-advisor/references/eng-productivity-and-quality.md` and `delivery-manager/SKILL.md`. Check any further attribution against the copied files.

Blinded sheet: `eval/validation/after/live_model_blind_sheet.csv` (+ `_key.csv`). Nobody has scored it yet; keep the model-written action only if it wins (section 4.6).


### 3c. NOT verified — still needs Cloudflare or people

- **The deployed endpoint.** The live run called Workers AI's REST API directly with the same model, messages, temperature and token limit; it did not go through the Pages Function or the `AI` binding. Expect the same behaviour, but confirm with the smoke tests in 4.5.
- **Cloudflare Access** token verification against real keys, and the role table.
- **D1 concurrency** for the rate limiter (tested against SQLite, whose locking differs).
- **The sprint-aligned worker** writing to D1.
- **Human judgement of the model's actions** (the blinded sheet above) and the expert content-validity panel.


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

### 4.6 Re-measure the AI (largely done; what remains)

Done locally with a token (section 3b). To repeat it, put `CLOUDFLARE_API_TOKEN` (a token with **Workers AI** permission) in `.env`, which is git-ignored, and run:
```bash
node --env-file=.env scripts/validation/live-model-eval.mjs --dry      # counts the calls first (no API use)
node --env-file=.env scripts/validation/live-model-eval.mjs --runs=3   # about 51 calls, well inside the free tier
```
It resolves the account id from the token. Never paste the token in chat or commit it; rotate it when the project ends.

What remains:
1. **Score the blinded sheet.** Two teammates fill `eval/validation/after/live_model_blind_sheet.csv` (preferred note, actionability and grounding 1-5) without opening `live_model_blind_key.csv`; then compute the model's win rate with a CI. Decision rule: keep the model-written action only if it passes the checks **and** wins more than 50% with a CI excluding 50%; otherwise ship the template.
2. **Decide what to do about the repetitive output** (see 3b) before spending effort on scoring; improving the prompt is cheaper than scoring a weak one.
3. **Re-run through the deployed endpoint** after deploying (the smoke test in 4.5 covers a single call).

Why the older harness is still not enough: `scripts/evaluate-coaching.mjs` calls `POST /api/eval/insight`, which is hidden in production on purpose and runs the **old** prompt through `buildPrompt`. It never executes `generateCoachingNote`. Use `live-model-eval.mjs` for the new pipeline.

Cost note: about 7 Workers AI neurons per note (free tier 10,000/day); healthy weeks no longer use any.


## 5. Running everything locally

```bash
nvm use 20 && npm install
npm run dev                                   # offline preview; /api/insight is a dev-only mock (see 8)
npm run lint
./node_modules/.bin/tsc --noEmit
(cd worker-ingestion && ../node_modules/.bin/tsc --noEmit -p tsconfig.json)

node scripts/test-facts-validate.mjs          # coaching logic, 36 checks
node scripts/test-no-raw-text.mjs             # no ticket/event text in data files or ingest writers
node scripts/test-sprint-align.mjs            # 15
node scripts/test-scoring-parity.mjs          # server and browser scorers agree

nvm use 22
node --no-warnings scripts/stress-test.mjs    # 32 API tests; needs Node >= 22.5 (node:sqlite)
node scripts/validation/simulate.mjs --set=both      # seeded early-warning evaluation (E2)
node scripts/validation/faithfulness.mjs             # coaching-layer checks (E2b)
node scripts/validation/replay-sprint5.mjs           # real Sprint 5 model outputs through the pipeline
node scripts/validation/persignal.mjs --final --k=1.5 --h=14   # per-signal CUSUM experiment
node --env-file=.env scripts/validation/live-model-eval.mjs    # real Workers AI model (needs CLOUDFLARE_API_TOKEN in .env)
```
Reproducing a "before" number: `git worktree add --detach /tmp/old feature/p0-hardening && ln -s "$PWD/node_modules" /tmp/old/node_modules`, then pass `--lib=/tmp/old/functions/api/_lib` (faithfulness, replay) or `--root=/tmp/old` (stress test). Outputs are written under `eval/validation/{before,after}/`.

`wrangler pages dev` needs a `CLOUDFLARE_API_TOKEN` for the AI binding, which is why the full local backend was never run here. Copy `.dev.vars.example` to `.dev.vars` for local runs.

## 6. Known open issues (most important first)

1. **Raw ticket and event text: fixed in the code and data, not yet in the database.** The four ingest writers (`scripts/jira-ingest.js`, `scripts/google-calendar-ingest.js`, `worker-ingestion/src/jira.ts`, `worker-ingestion/src/calendar.ts`) no longer store ticket `summary` or event `title`, and the two generated JSON files were stripped (23 summaries, 2 titles). `node scripts/test-no-raw-text.mjs` guards this (it reported 29 failures before the change). Still to do on Cloudflare: rows already in D1 keep old text until the worker re-runs; to clear it immediately run `UPDATE signal_weeks SET payload = json_remove(payload, '$.details', '$.jira.details', '$.calendar.details');` (`json_remove` ignores paths that are absent; table from `migrations/0001_init.sql`; untested against D1). Migration `0003` seed data also contains raw titles; it is history, so edit it only if the repo itself must be clean. The API already strips `details` on read.
2. **Whether the model adds value over the template is unproven.** It works on the live model (88.2% of replies accepted, no vague filler), but it mostly rewords the playbook step, and nobody has scored it against the template (section 3b, 4.6). If it does not win the blinded comparison, ship the template: it now carries the same specific advice.
3. **Cycle time reads ~0 days on the refreshed Jira data.** Jira timestamps are real-time and the board was populated in one sitting, so issues finished "in minutes". It becomes realistic only as issues move over several days.
4. **Calendar signal covers one week** (2026-W38). The October sprint shows the meeting load as a placeholder and excludes it from the score.
5. **GitHub is still a placeholder** (excluded from the score). Without it, review-bottleneck strain is nearly invisible (recall 65% → 15% in the seeded evaluation).
6. **The early-warning rule is a "big drops only" detector** (recall 43% on held-out seeded strain, 26% for subtle) and fires on 55% of benign events (holidays, planned hardening sprints). A per-signal CUSUM candidate raised subtle recall to 51% (95% CI 43–58%) but delayed detection from 1 to 3 weeks and raised benign fires to 68%; it was **not shipped** (`scripts/validation/persignal.mjs`, `eval/validation/after/persignal_heldout.md`).
7. **Human validation has not been run** (expert content-validity panel, blinded note comparison). A third, independently written scenario library is still needed (`scripts/validation/scenarios.mjs`: only the `HELDOUT` data changes).
8. **Minimum group size: decided 3, not enforced.** The team chose 3 consenting members (the skill in `docs/reference-skills/hr-operations/people-analytics/SKILL.md` suggests 5; 3 is weaker k-anonymity, accepted because teams here are small). Enforcing it needs a roster and consent record that do not exist yet, so no code suppresses a score today. The Solstice team (one to five engineers) is the first it would affect.
9. `eval/validation/e5_answer_key.json` is the answer key for the expert sessions: do not hand it to participants.

## 6a. Week 7 priorities: status

For "Evidence-Driven System Improvement" (implement the highest-priority improvements and show measurable improvement). Honest status:

| # | Priority from the Week 7 report | Status | Evidence / reason |
| --- | --- | --- | --- |
| 1 | Code-derived status and validated coaching wording | **Done, measured** | Section 3a (defects 73.7% -> 0%, replay 95% -> 0%, stress 20/32 -> 32/32) and live model runs in 3b |
| 2 | Expert review of the rule thresholds | **Blocked** | Needs human domain experts; only simulated data exists and it is not presented as expert validation |
| 3 | Suppress flags during benign events (holidays, planned hardening) | **Not built** | Measured problem (55% benign fires, issue 6); no calendar-context signal to key on yet |
| 4 | Per-signal CUSUM early warning | **Evaluated, not shipped** | Higher subtle recall, but slower detection and more benign fires (issue 6) |
| 5 | GitHub ingestion | **Not done** | Needs a token and a real repo; the live team is a Jira-only marketing team |
| 6 | Stakeholder (manager) validation of coaching notes | **Blocked** | Blinded sheet exists, nobody has scored it (issue 2) |
| 7 | Independent scenario library | **Not done** | Needs a second author (issue 7) |
| - | Privacy: no raw ticket/event text shipped | **Done, measured** | Issue 1, `scripts/test-no-raw-text.mjs` |
| - | Minimum group size | **Decided (3), not enforced** | Issue 8 |

Only #1 and the privacy fix carry measured before/after numbers; the rest are listed so nobody assumes they were attempted.

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
| `functions/api/_lib/{facts,template,validate,coaching,playbook}.ts` | Coaching pipeline (status, ranking, wording check, model call, per-signal playbook) |
| `docs/reference-skills/` | Third-party practitioner skills the playbook draws on (licence and attribution README inside) |
| `functions/api/_lib/{auth,ratelimit,evidence,signals,scoring}.ts` | Access/JWT, rate limiting, server-side evidence, signal merge, score |
| `src/logic/healthScore.js`, `src/data/mockSignals.js` | Browser scorer and data merge (must stay identical to the server copies; `test-scoring-parity.mjs` checks the scorer) |
| `worker-ingestion/` | Daily Cron Worker: Jira + Google Calendar into D1 |
| `migrations/0004_auth_rate.sql` | `role_assignments`, `rate_limits` |
| `scripts/stress-test.mjs` | API robustness suite |
| `scripts/validation/` | Seeded evaluation, faithfulness, replay, per-signal experiment and `live-model-eval.mjs` (real model) |
| `eval/validation/` | Generated evidence; `before/` and `after/` hold the comparable pairs |
| `DEPLOY.md`, `.dev.vars.example` | Original deploy steps and local env template |
