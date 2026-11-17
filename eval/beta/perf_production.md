# API latency, signed in (https://growth-3it.pages.dev, 2026-11-17T03:53:20.711Z)

100 requests per route, 10 at a time, from one client in California.

| Route | 200 OK | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| / | 100 of 100 | 58 ms | 210 ms | 229 ms |
| /api/health | 100 of 100 | 140 ms | 340 ms | 379 ms |
| /api/teams | 100 of 100 | 71 ms | 141 ms | 177 ms |
| /api/teams/platform/signals | 100 of 100 | 70 ms | 113 ms | 180 ms |
| /api/teams/solstice/signals | 100 of 100 | 94 ms | 180 ms | 191 ms |
| /api/teams/platform/roster | 100 of 100 | 106 ms | 182 ms | 195 ms |
## Page load (headless Chrome, signed in, 3 runs, 2026-11-17)

| Run | DOMContentLoaded | load event |
| --- | --- | --- |
| 1 | 587 ms | 587 ms |
| 2 | 825 ms | 826 ms |
| 3 | 589 ms | 590 ms |

Lighthouse desktop (eval/beta/lighthouse/desktop.html): FCP 1.0 s, LCP 1.6 s.

## AI coaching latency

Measured in Sprint 8 on the real Workers AI model through the production
coaching function (51 calls): p50 1.7 s, p95 2.5 s
(eval/validation/after/live_model_eval.md). The 8 s timeout falls back to
the template note.
