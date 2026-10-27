# Reference skills (third-party)

These files are **copied, unmodified,** from a public collection of practitioner "skills" (a local download
named `Claude-Skills-main`, author handle `borghei`). They are working guidance for agile and engineering
teams, **not peer-reviewed research and not written by this project**. Licence: **Commons Clause + MIT**
(`LICENSE` in this folder). The Commons Clause forbids *selling* the software; this is a course project, but
re-check the licence before any commercial use. Only 13 files (plus the licence) were copied, not the whole collection.

## What we used them for

The AI coach's next steps were generic. Sprint 5 and the first live-model run showed the model answering
"Schedule a meeting with the team to discuss ..." for most weeks (36 of 51 replies), which the agile-coach
skill describes as a red flag (process without an outcome). We took the **specific, outcome-linked moves**
from these files, put them in `functions/api/_lib/playbook.ts` (one per signal, with its source), and use
them three ways: as the template/fallback next step, as grounding in the model's prompt, and as the standard
the validator holds the model to (no vague "discuss it" filler).

| Signal | Move in the playbook | Where the idea comes from (file in this folder) |
| --- | --- | --- |
| Cycle time | Look at the oldest in-progress items first; limit work in progress | `project-management/execution/cycle-time-analyzer/SKILL.md`: cycle time as a distribution (never an average), aging work in progress, WIP limits |
| Sprint completion | Commit to less than full capacity, keep extras as stretch, re-plan unfinished work | `project-management/execution/sprint-plan/SKILL.md`: commitment discipline (target about 80% commit plus 15% stretch), commit vs stretch |
| Review turnaround | Agree a review SLA, check review load per reviewer and PR size | `c-level-advisor/vpe-advisor/references/eng-productivity-and-quality.md` (initial review within one business day, PR size, assign by code ownership); `project-management/delivery-manager/SKILL.md` (measure review load, keep batches small) |
| After-hours commits | Check whether ad-hoc requests eat sprint capacity, look at overtime, make sure time off is used | `project-management/agile-coach/scripts/team_health_checker.py` (the "sustainable pace" recommendation) |
| Meeting load | Audit recurring meetings; keep those that produce decisions; require an agenda and an owner | `project-management/meeting-analyzer/SKILL.md` (decision density, "a recurring meeting decides nothing") |

Other uses:

- **Why "schedule a meeting" is rejected:** `project-management/agile-coach/references/red-flags.md`, Red Flag 1
  ("process worship": ceremonies without a connected outcome) and its advice that every action be named,
  owned and time-boxed.
- **Privacy and misuse** (Sprint 8 responsible-deployment work): `hr-operations/people-analytics/SKILL.md`
  says to suppress results for any group under 5 respondents (k-anonymity, minimum group size of 5) and not to
  profile individuals; the cycle-time skill warns that flow metrics are team-level signals and that ranking
  individuals with them destroys the behaviour they measure. Our own Sprint 6 plan proposed a minimum of 3
  consenting members; **the skill says 5. That is an open decision for the team.**
- **Not wired into code yet, copied for the next iteration:** `scrum-master`, `sprint-retrospective`,
  `delivery-manager/references/red-flags.md` (retrospective prompts, sprint-health and delivery red flags).

## Limits (read before relying on this)

- The skills are one author's practitioner guidance. We used them for **specificity**, not as evidence that a
  given move works. Whether the coach's advice is useful is still an open question for the blinded human
  comparison (HANDOFF.md section 3b).
- Wording in `playbook.ts` is our paraphrase, with no digits (so template notes can be checked against the
  evidence). Do not quote it as the skills' own text.
