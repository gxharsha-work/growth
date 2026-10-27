# Live-model evaluation - RUN 2, parser fixed but BEFORE the coaching playbook (kept as the comparison baseline)

Real model `@cf/meta/llama-3.1-8b-instruct-fp8` on Cloudflare Workers AI, called through the production `generateCoachingNote` (new prompt, validator, 3 runs per case, temperature 0). 36 cases: 16 real Platform/Backend team-weeks and the seeded profiles at weeks 5 and 8.

| Measure | Result |
| --- | --- |
| Healthy weeks that called the model (must be 0) | 0 of 19 |
| Model calls made | 51 (17 cases x 3) |
| Reply is a usable single-line action (label optional) | 100.0% (51/51) |
| Wording passes the validator (note shown is model-written) | 70.6% (36/51) |
| Fell back to the template (reply rejected or call failed) | 29.4% (15/51) |
| Reply contains any digit (prompt forbids numbers) | 23.5% (12/51) |
| Same action text on all 3 runs of a case | 88.2% (15/17) |
| Action length, words (median / max) | 16 / 25 |
| Latency, ms (p50 / p95) | 1425 / 2028 |
| Status shown equals the code-derived status | 100% by construction |

**Why replies were rejected**

- number N is not attached to a known field: 9
- does not address the decided signal: 3
- number N does not match afterHoursCommits: 3

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
| backend-w5 | concern | model | Schedule a meeting with the team to discuss and set realistic meeting load targets for the upcoming week. |
| platform-w6 | healthy | template | No action needed — keep monitoring. |
| backend-w6 | concern | model | Investigate and discuss with the team the root cause of the prolonged review turnaround times. |
| platform-w7 | healthy | template | No action needed — keep monitoring. |
| backend-w7 | concern | model | Schedule a meeting with the team to discuss and set a goal to reduce review turnaround time to peer average within the next two weeks. |
| platform-w8 | healthy | template | No action needed — keep monitoring. |
| backend-w8 | concern | model | Schedule a meeting with the team to discuss and set a goal for reducing review turnaround time to peer average within the next sprint. |
| team-a1-w5 | concern | template | Review what is slowing tickets from start to done. |
| team-a1-w8 | low | model | Schedule a meeting with the team to discuss and set realistic meeting load expectations and boundaries. |
| team-a2-w5 | steady | model | Schedule a meeting with the team to discuss and set realistic meeting load targets for the upcoming week. |
| team-a2-w8 | concern | template | Review what is slowing tickets from start to done. |
| team-a3-w5 | concern | template | Check whether deadlines are pushing work late in the day. |
| team-a3-w8 | steady | model | Investigate the root cause of the prolonged cycle time to identify areas for process improvement. |
| team-a4-w5 | healthy | template | No action needed — keep monitoring. |
| team-a4-w8 | healthy | template | No action needed — keep monitoring. |
| team-a5-w5 | healthy | template | No action needed — keep monitoring. |
| team-a5-w8 | healthy | template | No action needed — keep monitoring. |
| team-b1-w5 | healthy | template | No action needed — keep monitoring. |
| team-b1-w8 | steady | template | Check whether deadlines are pushing work late in the day. |
| team-b2-w5 | concern | model | Schedule a meeting with the team to discuss and set realistic review turnaround goals and expectations. |
| team-b2-w8 | concern | template | Review what is slowing tickets from start to done. |
| team-b3-w5 | steady | model | Schedule a meeting with the team to discuss and adjust meeting load to optimize team capacity and efficiency. |
| team-b3-w8 | steady | model | Schedule a team meeting to discuss and explore strategies to improve sprint completion rates. |
| team-b4-w5 | steady | model | Schedule a meeting with the team to discuss and establish a plan to reduce after-hours commits. |
| team-b4-w8 | steady | model | Schedule a team meeting to discuss and explore strategies to improve sprint completion rates. |
| team-b5-w5 | healthy | template | No action needed — keep monitoring. |
| team-b5-w8 | healthy | template | No action needed — keep monitoring. |
