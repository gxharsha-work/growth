# Replay of real Sprint 5 model outputs through the coaching pipeline

Code under test: `feature/p0-hardening` (the code before the Sprint 8 changes, checked out with `git worktree`). Input: 80 recorded live-model notes (Sprint 5, config C, 16 real team-weeks x 5 runs).

| Measure (what the user would have been shown) | Result |
| --- | --- |
| Healthy weeks shown as a concern (false concern) | 95.0% (57/60) |
| Early-warning weeks shown as healthy (false reassurance) | 0.0% (0/20) |
| Status agrees with the deterministic flag | 28.8% (23/80) |
| Notes whose wording came from the model | 97.5% (78/80) |
| Model calls made | 80 of 80 |
