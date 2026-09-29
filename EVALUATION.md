# Sprint 5 — Core AI/Technology Prototype: Evaluation Report

**What this is:** Growth's Sprint 3/4 docs specified a 5-stage pipeline —
*data ingestion → health scoring → peer benchmarking → early-warning
detection → AI coaching* — and explicitly scoped the last stage as a
documented-but-unbuilt stretch feature: *"For teams that trigger an early
warning, Growth may generate an AI-authored coaching suggestion grounded in
an anonymized comparison to a relevant peer team... evaluated for whether
it adds actionable context beyond the underlying health signals."* This
sprint builds that stage and evaluates it against the deterministic
baseline (Sprint 3/"Assignment 3"), on the three criteria those docs
already committed to: **risk detection, interpretability, usefulness.**

## Core technology

- **Model:** `@cf/meta/llama-3.1-8b-instruct-fp8` on **Cloudflare Workers
  AI** — free tier, no billing account needed, runs inside the same
  Cloudflare infrastructure as the rest of the app (`[ai]` binding in
  `wrangler.toml`, implementation in `functions/api/_lib/coaching.ts`,
  exposed as `POST /api/insight`).
- **Input:** only already-aggregated, team-level structured evidence —
  composite score, week-over-week trend, early-warning state, the five
  signal values, and one anonymized same-cohort peer team's numbers. Never
  raw per-person ticket/commit/calendar data (there is none in this
  evidence shape to begin with).
- **Grounding constraints**, enforced via the system prompt (see
  `coaching.ts`): only reference facts given, never diagnose burnout or
  attrition, frame everything as "worth investigating" not a verdict, name
  the specific signal(s) driving the score, end with one concrete
  suggested action — directly implementing the Responsible AI section of
  the Sprint 4 architecture doc.
- **UI:** `src/ui/CoachingNote.jsx`, a button in the team HUD ("Get AI
  coaching suggestion") that POSTs the current week's already-computed
  evidence and renders the result. A failure here degrades to an inline
  error — the score, trend, and signals above it are computed independently
  and unaffected, matching the architecture doc's "AI layer is an
  enhancement, never a dependency" framing.

## Evaluation methodology

`scripts/evaluate-coaching.mjs` reproduces the deterministic baseline from
the live scoring logic (`src/logic/healthScore.js`, unchanged by this
sprint) across Platform Team (stable/improving) and Backend Team
(documented decline), then exercises the AI layer on two cases: Backend's
week 8 (the most severe early-warning week) and Platform's week 8 (a
healthy control case, to test whether the model manufactures false
concern). There is no ground-truth label for "correct coaching text" — the
Sprint 3 doc itself names this as an open problem ("*lack of a definitive
ground truth for team health*") — so outputs are scored qualitatively
against the three stated criteria, with concrete examples rather than a
single aggregate number.

### Reproduced baseline table

| Week | Platform Score | Platform Status | Backend Score | Backend Status |
|------|-----------------|------------------|----------------|------------------|
| 1 | 78 | Healthy | 81 | Healthy |
| 2 | 81 | Healthy | 81 | Healthy |
| 3 | 83 | Healthy | 80 | Healthy |
| 4 | 85 | Healthy | 72 | Healthy |
| 5 | 87 | Healthy | 59 | **Early Warning** |
| 6 | 88 | Healthy | 45 | **Early Warning** |
| 7 | 90 | Healthy | 30 | **Early Warning** |
| 8 | 91 | Healthy | 15 | **Early Warning** |

Note: these numbers differ slightly from Sprint 3's original illustrative
table (which had Backend triggering at week 6 and bottoming at 55, not
week 5 and 15) — the scoring weights/thresholds were refined between
Sprint 3 and now. The qualitative story Sprint 3 tested for is unchanged
(Platform stays healthy and trends up; Backend declines into a sustained
early-warning state), and this run is against the actual current, deployed
system of record — the correct baseline to compare the AI layer against,
not the older static table.

### Case 1 — Backend Team, week 8 (Early Warning, score 15)

> *"This week's score of 15/100 is worth investigating, especially given
> the decline from last week. The team's Jira cycle time of 6.5 days and
> sprint completion of 44% are both significantly lower than those of a
> peer team in the same size and function cohort, who achieved a score of
> 91/100 with a cycle time of 2.5 days and sprint completion of 92%. It's
> worth checking in on whether the team's meeting load of 17.5 hours/week
> is contributing to these delays. Consider asking the team lead to review
> the meeting schedule and discuss with the team whether any meetings can
> be optimized or streamlined."*

| Criterion | Assessment |
|---|---|
| **Risk detection** | Correctly identifies this as worth investigating and names the two dominant signals (cycle time, sprint completion) that the deterministic scorer also weights most heavily for the capability sub-score. Doesn't invent a cause. |
| **Interpretability** | Reads clearly with no jargon; a manager unfamiliar with the scoring internals gets the "why" in one paragraph instead of reading five raw numbers. |
| **Usefulness** | Ends with a specific, low-effort next step (review the meeting schedule) grounded in the one signal (17.5h/week meetings) it correctly flagged as a plausible contributor — matches Sprint 3's bar of "adds actionable context beyond the underlying health signals," since the raw dashboard doesn't suggest *what to do* on its own. |

### Case 2 — Platform Team, week 8 (Healthy, score 91) — a failure case

> *"It's worth investigating the Platform Team's relatively high meeting
> load, which stands out as 4.8 hours/week compared to the peer team's
> 17.5 hours/week. Additionally, the team's Jira cycle time is slightly
> below the average, but worth checking in on..."*

Two concrete problems, both worth naming plainly:

1. **Rule violation.** The system prompt explicitly says: *"If
   early-warning is NOT triggered and the trend is stable or improving,
   say so plainly and briefly instead of manufacturing concern."* The
   model still manufactured concern about a healthy team.
2. **Factual/reasoning error.** It calls 4.8 hours/week "relatively high"
   *compared to* the peer's 17.5 hours/week — backwards; 4.8 is
   dramatically *lower*. This is a small hallucination in comparative
   reasoning, not a grounding failure (the two numbers themselves are
   correct, taken straight from the evidence) — the model just got the
   direction of the comparison wrong.

This is the single most important finding of this sprint: **an 8B
free-tier model, even with an explicit, unambiguous rule against it, will
sometimes manufacture false concern and get simple numeric comparisons
backwards.** This is exactly why Sprint 3/4's own design — deterministic
scoring as the system of record, AI strictly as an optional narrative layer
a manager can also just not click — is the right call, not a hedge.

## Technical analysis

- **Model capability ceiling.** Free-tier Workers AI's small instruct
  models (8B-class) are noticeably weaker at multi-number comparative
  reasoning than a frontier model would be, as Case 2 shows directly. A
  larger model (e.g. Workers AI's `llama-3.3-70b-instruct-fp8-fast`, or an
  external frontier API) would likely reduce this failure mode, at a real
  dollar cost this project explicitly avoided for this pass.
- **No ground truth.** As Sprint 3 already found, there's no labeled
  "correct coaching note" to score against — evaluation here is
  necessarily qualitative/rubric-based against the three stated criteria,
  not a single accuracy number. A real integration would want a small
  human-rated eval set (managers rating usefulness 1-5) before trusting
  this at scale, which the Sprint 4 doc's "allows managers to rate whether
  an insight was useful or accurate" already anticipates and this sprint
  doesn't yet implement.
- **Thin real data.** Solstice (the one team with real ingested Jira/
  Calendar data) only has 2 weeks of history so far — not enough for a
  meaningful trailing baseline or a real early-warning test. All coaching
  evaluation here necessarily used the two hand-tuned demo teams, which is
  the same limitation Sprint 3 already flagged ("*constrained testing
  cohort, reliance on synthetic data points*").
- **No consistency testing across repeated calls.** LLM outputs aren't
  deterministic; the same evidence could produce a meaningfully different
  note on a re-run. Not tested here for time; worth checking before
  treating any single note as authoritative.
- **What's needed before real end-to-end integration:** (1) a larger or
  frontier model, or few-shot examples in the prompt, to reduce the
  Case-2-style reasoning errors; (2) a manager-facing usefulness rating,
  feeding back into prompt iteration; (3) enough real historical data
  (multiple pilot teams, many weeks) to test coaching quality on genuine
  declines, not just the synthetic Backend Team narrative; (4) rate
  limiting / caching given Workers AI's free-tier daily quota, since a
  "one suggestion per flagged team per day" cadence at real org scale would
  need to stay within it.

## Repository / demo

- Feature branch: `feature/cloudflare-backend`
- Live: https://feature-cloudflare-backend.growth-3it.pages.dev (click any
  team's "Get AI coaching suggestion" button)
- Reproduce this report's numbers: `node scripts/evaluate-coaching.mjs`
