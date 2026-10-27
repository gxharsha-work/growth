# Replay of real Sprint 5 model outputs through the coaching pipeline

Code under test: `functions/api/_lib/`. Input: 80 recorded live-model notes (Sprint 5, config C, 16 real team-weeks x 5 runs).

| Measure (what the user would have been shown) | Result |
| --- | --- |
| Healthy weeks shown as a concern (false concern) | 0.0% (0/60) |
| Early-warning weeks shown as healthy (false reassurance) | 0.0% (0/20) |
| Status agrees with the deterministic flag | 100.0% (80/80) |
| Notes whose wording came from the model | 25.0% (20/80) |
| Model calls made | 20 of 80 |
