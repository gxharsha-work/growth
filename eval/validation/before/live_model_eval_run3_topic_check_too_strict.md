# Live-model evaluation - RUN 3, playbook added but the topic check was too strict (kept as evidence: it rejected on-topic advice because it required the literal signal name; 35.3% accepted)

Real model `@cf/meta/llama-3.1-8b-instruct-fp8` on Cloudflare Workers AI, called through the production `generateCoachingNote` (new prompt, validator, 3 runs per case, temperature 0). 36 cases: 16 real Platform/Backend team-weeks and the seeded profiles at weeks 5 and 8.

| Measure | Result |
| --- | --- |
| Healthy weeks that called the model (must be 0) | 0 of 19 |
| Model calls made | 51 (17 cases x 3) |
| Reply is a usable single-line action (label optional) | 100.0% (51/51) |
| Wording passes the validator (note shown is model-written) | 35.3% (18/51) |
| Fell back to the template (reply rejected or call failed) | 64.7% (33/51) |
| Reply contains any digit (prompt forbids numbers) | 11.8% (6/51) |
| Reply starts with "Schedule a ..." | 0.0% (0/51) |
| Reply only suggests a meeting or discussion (vague filler) | 0.0% (0/51) |
| Reply gives a time frame ("this sprint", "this week" ...) | 9.8% (5/51) |
| Distinct replies across 51 calls | 11 |
| Same action text on all 3 runs of a case | 88.2% (15/17) |
| Action length, words (median / max) | 24 / 28 |
| Latency, ms (p50 / p95) | 1681 / 2242 |
| Status shown equals the code-derived status | 100% by construction |

**Why replies were rejected**

- does not address the decided signal: 21
- wording too long: 6
- number N is not attached to a known field: 6

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
| backend-w5 | concern | model | Audit recurring meetings: keep the ones that produce decisions, shorten or cancel the rest, and require an agenda and an owner. |
| platform-w6 | healthy | template | No action needed — keep monitoring. |
| backend-w6 | concern | model | Agree a service level for the first review within one working day and check review load per reviewer and pull request size to identify potential bottlenecks. |
| platform-w7 | healthy | template | No action needed — keep monitoring. |
| backend-w7 | concern | model | Agree a service level for the first review within one working day and check review load per reviewer and pull request size. |
| platform-w8 | healthy | template | No action needed — keep monitoring. |
| backend-w8 | concern | model | Agree a service level for the first review within one working day and check review load per reviewer and pull request size to identify potential bottlenecks. |
| team-a1-w5 | concern | template | Look at the oldest in-progress items first and limit work in progress so work finishes before new work starts. |
| team-a1-w8 | low | model | Audit recurring meetings: keep the ones that produce decisions, shorten or cancel the rest, and require an agenda and an owner for all meetings this sprint. |
| team-a2-w5 | steady | template | Audit recurring meetings: keep the ones that produce decisions, shorten or cancel the rest, and require an agenda and an owner. |
| team-a2-w8 | concern | template | Look at the oldest in-progress items first and limit work in progress so work finishes before new work starts. |
| team-a3-w5 | concern | template | Check whether ad-hoc requests are eating sprint capacity, look at overtime trends, and make sure time off is being used. |
| team-a3-w8 | steady | template | Look at the oldest in-progress items first and limit work in progress so work finishes before new work starts. |
| team-a4-w5 | healthy | template | No action needed — keep monitoring. |
| team-a4-w8 | healthy | template | No action needed — keep monitoring. |
| team-a5-w5 | healthy | template | No action needed — keep monitoring. |
| team-a5-w8 | healthy | template | No action needed — keep monitoring. |
| team-b1-w5 | healthy | template | No action needed — keep monitoring. |
| team-b1-w8 | steady | template | Check whether ad-hoc requests are eating sprint capacity, look at overtime trends, and make sure time off is being used. |
| team-b2-w5 | concern | model | Agree a service level for the first review within one working day and check review load per reviewer and pull request size this sprint. |
| team-b2-w8 | concern | template | Look at the oldest in-progress items first and limit work in progress so work finishes before new work starts. |
| team-b3-w5 | steady | template | Audit recurring meetings: keep the ones that produce decisions, shorten or cancel the rest, and require an agenda and an owner. |
| team-b3-w8 | steady | template | Commit to less than full team capacity, keep extra items as stretch, and re-plan unfinished work instead of rolling it over. |
| team-b4-w5 | steady | template | Check whether ad-hoc requests are eating sprint capacity, look at overtime trends, and make sure time off is being used. |
| team-b4-w8 | steady | template | Commit to less than full team capacity, keep extra items as stretch, and re-plan unfinished work instead of rolling it over. |
| team-b5-w5 | healthy | template | No action needed — keep monitoring. |
| team-b5-w8 | healthy | template | No action needed — keep monitoring. |
