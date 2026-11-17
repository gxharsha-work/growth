## Per-signal change detection (priority #4) — HELD-OUT, parameters chosen on DEV: CUSUM k=1.5, h=14

### HELD-OUT, noise x1, all five signals

| Detector | Recall (all) | Subtle [95% CI] | Clear | Median latency (wks) | False alarms / team-month | Benign controls fired |
| --- | --- | --- | --- | --- | --- | --- |
| D0 shipped (control) | 43% | 26% [19%–33%] | 60% | 1.0 | 0.004 | 55% |
| D4 shipped + per-signal CUSUM | 72% | 51% [43%–58%] | 93% | 3.0 | 0.006 | 68% |

### Sensitivity: weekly noise x data availability (recall / false alarms per team-month)

| Noise | Data | D0 | D4 |
| --- | --- | --- | --- |
| x0.25 | all 5 signals | 21% / 0.00 | 88% / 0.00 |
| x0.25 | live only (GitHub excluded) | 19% / 0.00 | 60% / 0.00 |
| x1 | all 5 signals | 43% / 0.00 | 72% / 0.01 |
| x1 | live only (GitHub excluded) | 46% / 0.02 | 55% / 0.03 |
| x1.6 | all 5 signals | 71% / 0.07 | 79% / 0.08 |
| x1.6 | live only (GitHub excluded) | 76% / 0.17 | 79% / 0.17 |
| x2.5 | all 5 signals | 93% / 0.26 | 92% / 0.27 |
| x2.5 | live only (GitHub excluded) | 94% / 0.39 | 93% / 0.39 |
