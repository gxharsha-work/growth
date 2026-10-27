# Live-model evaluation of the current coaching pipeline

Real model `@cf/meta/llama-3.1-8b-instruct-fp8` on Cloudflare Workers AI, called through the production `generateCoachingNote` (new prompt, validator, 3 runs per case, temperature 0). 36 cases: 16 real Platform/Backend team-weeks and the seeded profiles at weeks 5 and 8.

| Measure | Result |
| --- | --- |
| Healthy weeks that called the model (must be 0) | 0 of 19 |
| Model calls made | 51 (17 cases x 3) |
| Reply is a usable single-line action (label optional) | 100.0% (51/51) |
| Wording passes the validator (note shown is model-written) | 88.2% (45/51) |
| Fell back to the template (reply rejected or call failed) | 11.8% (6/51) |
| Reply contains any digit (prompt forbids numbers) | 11.8% (6/51) |
| Reply starts with "Schedule a ..." | 0.0% (0/51) |
| Reply only suggests a meeting or discussion (vague filler) | 0.0% (0/51) |
| Reply gives a time frame ("this sprint", "this week" ...) | 5.9% (3/51) |
| Distinct replies across 51 calls | 9 |
| Same action text on all 3 runs of a case | 100.0% (17/17) |
| Action length, words (median / max) | 25 / 28 |
| Latency, ms (p50 / p95) | 1728 / 2509 |
| Status shown equals the code-derived status | 100% by construction |

**Why replies were rejected**

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
| backend-w7 | concern | model | Agree a service level for the first review within one working day and check review load per reviewer and pull request size to identify potential bottlenecks. |
| platform-w8 | healthy | template | No action needed — keep monitoring. |
| backend-w8 | concern | model | Agree a service level for the first review within one working day and check review load per reviewer and pull request size to identify potential bottlenecks. |
| team-a1-w5 | concern | model | Limit work in progress to ensure items finish before new ones start, focusing on the oldest in-progress items first. |
| team-a1-w8 | low | model | Audit recurring meetings: keep the ones that produce decisions, shorten or cancel the rest, and require an agenda and an owner for all meetings this sprint. |
| team-a2-w5 | steady | model | Audit recurring meetings to ensure they produce decisions and actions, and shorten or cancel those that do not, requiring an agenda and an owner for the remaining meetings. |
| team-a2-w8 | concern | model | Limit work in progress to ensure items finish before new ones start, focusing on the oldest in-progress items first. |
| team-a3-w5 | concern | model | Ensure sprint capacity is not being consumed by unplanned requests, and verify that team members are taking scheduled time off to maintain a sustainable pace. |
| team-a3-w8 | steady | model | Limit work in progress to ensure items finish before new ones start, focusing on the oldest in-progress items first. |
| team-a4-w5 | healthy | template | No action needed — keep monitoring. |
| team-a4-w8 | healthy | template | No action needed — keep monitoring. |
| team-a5-w5 | healthy | template | No action needed — keep monitoring. |
| team-a5-w8 | healthy | template | No action needed — keep monitoring. |
| team-b1-w5 | healthy | template | No action needed — keep monitoring. |
| team-b1-w8 | steady | model | Ensure sprint capacity is not being consumed by unplanned requests, and verify that team members are taking scheduled time off to maintain a sustainable pace. |
| team-b2-w5 | concern | model | Agree a service level for the first review within one working day and check review load per reviewer and pull request size to identify potential bottlenecks. |
| team-b2-w8 | concern | model | Limit work in progress to ensure items finish before new ones start, focusing on the oldest in-progress items first. |
| team-b3-w5 | steady | model | Audit recurring meetings to ensure they produce decisions and actions, and shorten or cancel those that don't, requiring an agenda and owner for the remaining meetings. |
| team-b3-w8 | steady | template | Commit to less than full team capacity, keep extra items as stretch, and re-plan unfinished work instead of rolling it over. |
| team-b4-w5 | steady | model | Ensure sprint capacity is not being consumed by unplanned requests, and verify that team members are taking scheduled time off to maintain a sustainable pace. |
| team-b4-w8 | steady | template | Commit to less than full team capacity, keep extra items as stretch, and re-plan unfinished work instead of rolling it over. |
| team-b5-w5 | healthy | template | No action needed — keep monitoring. |
| team-b5-w8 | healthy | template | No action needed — keep monitoring. |
