# Live-model evaluation - RUN 1, before the reply-format fix (kept as evidence: 0% of replies were accepted because the parser required an "ACTION:" prefix that the model does not emit)

Real model `@cf/meta/llama-3.1-8b-instruct-fp8` on Cloudflare Workers AI, called through the production `generateCoachingNote` (new prompt, validator, 3 runs per case, temperature 0). 36 cases: 16 real Platform/Backend team-weeks and the seeded profiles at weeks 5 and 8.

| Measure | Result |
| --- | --- |
| Healthy weeks that called the model (must be 0) | 0 of 19 |
| Model calls made | 51 (17 cases x 3) |
| Reply has the single `ACTION:` line | 0.0% (0/51) |
| Wording passes the validator (note shown is model-written) | 0.0% (0/51) |
| Fell back to the template (reply rejected or call failed) | 100.0% (51/51) |
| Reply contains any digit (prompt forbids numbers) | 23.5% (12/51) |
| Same action text on all 3 runs of a case | 100.0% (17/17) |
| Action length, words (median / max) | undefined / -Infinity |
| Latency, ms (p50 / p95) | 1374 / 2159 |
| Status shown equals the code-derived status | 100% by construction |

**Why replies were rejected**

- no ACTION line: 51

**Per case** (first run shown)

| Case | Status | Source | Action shown |
| --- | --- | --- | --- |
| platform-w1 | healthy | template | No action needed — keep monitoring. |
| backend-w1 | healthy | template | No action needed — keep monitoring. |
| platform-w2 | healthy | template | No action needed — keep monitoring. |
| backend-w2 | healthy | template | No action needed — keep monitoring. |
| platform-w3 | healthy | template | No action needed — keep monitoring. |
| backend-w3 | healthy | template | No action needed — keep monitoring. |
| platform-w4 | healthy | template | No action needed — keep monitoring. |
| backend-w4 | healthy | template | No action needed — keep monitoring. |
| platform-w5 | healthy | template | No action needed — keep monitoring. |
| backend-w5 | concern | template | Audit recurring meetings for any that can be dropped. |
| platform-w6 | healthy | template | No action needed — keep monitoring. |
| backend-w6 | concern | template | Spread review load or agree a review turnaround target. |
| platform-w7 | healthy | template | No action needed — keep monitoring. |
| backend-w7 | concern | template | Spread review load or agree a review turnaround target. |
| platform-w8 | healthy | template | No action needed — keep monitoring. |
| backend-w8 | concern | template | Spread review load or agree a review turnaround target. |
| team-a1-w5 | concern | template | Review what is slowing tickets from start to done. |
| team-a1-w8 | low | template | Audit recurring meetings for any that can be dropped. |
| team-a2-w5 | steady | template | Audit recurring meetings for any that can be dropped. |
| team-a2-w8 | concern | template | Review what is slowing tickets from start to done. |
| team-a3-w5 | concern | template | Check whether deadlines are pushing work late in the day. |
| team-a3-w8 | steady | template | Review what is slowing tickets from start to done. |
| team-a4-w5 | healthy | template | No action needed — keep monitoring. |
| team-a4-w8 | healthy | template | No action needed — keep monitoring. |
| team-a5-w5 | healthy | template | No action needed — keep monitoring. |
| team-a5-w8 | healthy | template | No action needed — keep monitoring. |
| team-b1-w5 | healthy | template | No action needed — keep monitoring. |
| team-b1-w8 | steady | template | Check whether deadlines are pushing work late in the day. |
| team-b2-w5 | concern | template | Spread review load or agree a review turnaround target. |
| team-b2-w8 | concern | template | Review what is slowing tickets from start to done. |
| team-b3-w5 | steady | template | Audit recurring meetings for any that can be dropped. |
| team-b3-w8 | steady | template | Check scope and blockers on the unfinished sprint work. |
| team-b4-w5 | steady | template | Check whether deadlines are pushing work late in the day. |
| team-b4-w8 | steady | template | Check scope and blockers on the unfinished sprint work. |
| team-b5-w5 | healthy | template | No action needed — keep monitoring. |
| team-b5-w8 | healthy | template | No action needed — keep monitoring. |
