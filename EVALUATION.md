# Sprint 5 — Evaluation Report: AI Coaching Layer

**What this is:** Growth's Sprint 3/4 docs specified a 5-stage pipeline —
*data ingestion → health scoring → peer benchmarking → early-warning
detection → AI coaching* — and explicitly scoped the last stage as
documented-but-unbuilt: *"For teams that trigger an early warning, Growth
may generate an AI-authored coaching suggestion grounded in an anonymized
comparison to a relevant peer team... evaluated for whether it adds
actionable context beyond the underlying health signals."* This sprint
builds that stage and evaluates it, rigorously, against the deterministic
baseline (Sprint 3/"Assignment 3"), on the three criteria those docs
already committed to: **risk detection, interpretability, usefulness.**

This version replaces an earlier draft that evaluated the AI layer on two
hand-picked examples. This one runs a systematic harness across **255 test
runs**: all 16 real Platform/Backend team-weeks (each run 5×) plus 5
constructed edge cases, across three configurations. The conclusion is
less flattering than the earlier draft's — and more useful for exactly
that reason.

## Core technology (unchanged from the earlier draft)

- **Model:** `@cf/meta/llama-3.1-8b-instruct-fp8` on Cloudflare Workers AI — free tier.
- **Input:** only aggregated, team-level structured evidence — composite score, trend, early-warning state, five signals, one anonymized peer team.
- **Implementation:** [`functions/api/_lib/coaching.ts`](./functions/api/_lib/coaching.ts) (`POST /api/insight`), UI in [`src/ui/CoachingNote.jsx`](./src/ui/CoachingNote.jsx).
- **Eval-only endpoint:** `POST /api/eval/insight` runs an arbitrary system prompt/model against the same evidence formatting, purely for this harness — not linked from the product UI.

## Evaluation methodology

[`scripts/evaluate-coaching.mjs`](./scripts/evaluate-coaching.mjs) is a reproducible harness. Run it yourself:

```
node scripts/evaluate-coaching.mjs --configs=A,B,C
```

**Test set (21 cases):**
- 16 real team-weeks — Platform Team and Backend Team, weeks 1–8 each, pulled live from the deployed API and scored with the unchanged deterministic baseline (`healthScore.js`). Each run **5 times** to measure run-to-run consistency.
- 5 constructed edge cases (1 run each): a missing/unavailable calendar signal, a flat/stable team, a team recovering after an early warning, a team with no same-cohort peer, and Solstice's real live ingested data (which also has no same-cohort peer among current teams — a genuine, not synthetic, instance of that condition).

**Configs compared:**
| | What it is |
|---|---|
| **A** | A deterministic rule-based template — no LLM at all. Built from the same weighted-deficit calculation the composite score itself uses, so it always names the mathematically correct top-contributing signal. This is the floor: what you get for free, with no AI risk at all. |
| **B** | The **original** coaching prompt this project shipped with (free-text, 3–5 sentence paragraph, no structure requirement). |
| **C** | The **current, tightened** prompt (structured `STATUS`/`SIGNAL`/`ACTION`, explicit anti-false-alarm and comparison-direction rules) — what's actually live in production today. |

**Metrics** (all computed automatically; see the CAVEATS section for what's heuristic vs. exact):

| Metric | What it measures |
|---|---|
| Status agreement | Does the note's tone match the deterministic early-warning flag? |
| False-alarm rate | Among genuinely *healthy* weeks, how often did the note express concern anyway? |
| Miss rate | Among genuinely *early-warning* weeks, how often did the note fail to express concern? |
| Number grounding | Every number the note states — does it actually appear in the evidence given? |
| Comparison direction | When the note says "higher"/"lower" than the peer, is that actually true? |
| Driver match | Does the named signal match the signal the composite score is mathematically most sensitive to? |
| 5-run consistency | Across 5 repeated calls on the same evidence, how often does the concern/no-concern verdict agree with itself? |
| Format validity | Did the response parse into the expected shape? |
| p50 / p95 latency | Response time. |

Actionability (1–5) is deliberately **not** auto-scored — `eval/results.csv` has two blank columns for two people to hand-rate it, since "is this actually a good suggestion" is a judgment call a script shouldn't make unilaterally.

## Results

| Config | N | Status Agreement | False-Alarm Rate | Miss Rate | Number Grounding | Comparison Direction | Driver Match | 5-Run Consistency | Format Validity | p50 Latency | p95 Latency | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **A** — Rule-based template | 85 | 100% | 0% | 0% | 100% | n/a* | 100% | 100% | 100% | ~0ms | ~0ms | 0 |
| **B** — Original prompt | 85 | 25% | **100%** | 0% | 55% | 67% | 67% | 100% | **0%** | 6,689ms | 9,738ms | 1 |
| **C** — Current prompt | 85 | 27% | **97%** | 0% | 67% | 74% | 33% | 98% | **99%** | 2,731ms | 4,069ms | 1 |

*A's template states numbers side by side without directional language ("higher"/"lower"), so there's nothing for the comparison-direction check to evaluate — not a failure, just not applicable.

Breaking down the false-alarm number precisely, across all 80 real-team-week runs (60 genuinely healthy, 20 genuinely early-warning) per config:

| | Healthy weeks flagged as concern | Early-warning weeks flagged as concern |
|---|---|---|
| **B** | **60 / 60 (100%)** | 20 / 20 (100%) |
| **C** | **58 / 60 (97%)** | 20 / 20 (100%) |

## The headline finding: the STATUS line carries almost no signal

**Both configs flag concern on essentially every single week, healthy or not.** Config B never once said a healthy team was fine — 60 for 60. Config C improved that only marginally, to 58/60. A 0% miss rate sounds good in isolation, but it's a statistical artifact of this: a system that says "worth investigating" unconditionally will *always* have a 0% miss rate, because it never says anything else. **On the single most basic job of this feature — telling a manager whether a team needs attention or not — the current AI layer provides close to zero discriminative value over the deterministic baseline it's supposed to add color to.**

This is a materially different, more honest conclusion than an earlier draft of this report reached from two hand-picked examples. It's also exactly what a rigorous evaluation is for.

## What did improve from B → C

The Sprint 5 prompt-tightening work wasn't wasted — it measurably fixed real things, just not the most important one:

- **Format validity: 0% → 99%.** B was never designed to produce parseable structured output and didn't. C reliably does — this is what actually fixed the original "unreadable, unscrollable" UI bug this sprint started from.
- **Number grounding: 55% → 67%**, **comparison direction: 67% → 74%.** The explicit "double-check the direction" rule measurably reduced (not eliminated) the backwards-comparison failure documented below.
- **Latency: 6,689ms → 2,731ms p50** (2.4× faster). Asking for three short lines instead of a paragraph is a real, unplanned performance win.

## What got worse from B → C

- **Driver match: 67% → 33%.** Compressing the SIGNAL line to "under 18 words" seems to have come at the cost of the model correctly identifying the *mathematically* top-weighted signal — it more often named a real but secondary signal instead. This is a genuine, non-obvious tradeoff: the same edit that fixed the UI overflow bug measurably hurt this one accuracy metric. Worth knowing, not worth panicking over — it's better than a coin flip, and grounded in real evidence numbers even when it picks the "wrong" one.

## Concrete examples

**A correct, useful case** (Backend Team, a genuine decline):
> STATUS: Worth investigating
> SIGNAL: Cycle time (6.5d) is 2.5x slower than peer team (2.5d)
> ACTION: Investigate process bottlenecks causing delayed Jira cycle time.

This is exactly right — real early-warning week, correctly flagged, correct driver, correct direction, concrete next step.

**The core failure, illustrated** (Platform Team, week 8 — score 91, about as healthy as this dataset gets):
> STATUS: Worth investigating
> SIGNAL: Jira cycle time is 1.5 days faster than peer team's 6.5 days.

Read that second line again: the model **correctly computed that Platform's cycle time is better than its peer's** — and immediately labeled the team "worth investigating" anyway. This isn't a subtle reasoning slip; the model states a fact that argues *against* its own conclusion in the same breath. Prompt rule 5 explicitly says not to do this. It did it anyway, on 58 of 60 healthy weeks tested.

**The crash edge case:**
`avgMeetingHoursPerWeek` omitted from the evidence (simulating a signal that hasn't synced yet) crashed the request server-side with `Cannot read properties of undefined (reading 'toFixed')` in **both** B and C, on **every** attempt — a 100% reproduction rate, not a fluke. This directly violated Sprint 3's own requirement: *"Missing or unavailable signals should reduce the set of indicators used rather than prevent the system from functioning."* **We found this via the harness and fixed it** (`buildPrompt` now omits a missing signal's line instead of crashing, confirmed working post-fix) — but the 255-row dataset above predates that fix, so both configs' `errors` column above still shows it as found. A full re-run after the fix is a natural next step, not done here to avoid re-spending free-tier quota on 253 rows that didn't need re-running.

## Does the AI layer clear the bar Sprint 3 set?

Sprint 3's own evaluation criteria were **risk detection, interpretability, usefulness.** Scored honestly against the full dataset, not two examples:

| Criterion | Verdict |
|---|---|
| **Risk detection** | ❌ **Does not currently clear the bar.** A system that flags 97-100% of weeks regardless of actual status cannot be said to be detecting risk — it's expressing uniform, low-confidence concern. The deterministic baseline's binary healthy/early-warning flag remains strictly more trustworthy for this job. |
| **Interpretability** | ✅ Where the SIGNAL/ACTION content is accurate (driver match ~33-67%, grounding ~67%), it does explain *what* in plain language better than raw numbers. |
| **Usefulness** | ⚠️ Mixed. The ACTION line is consistently well-formed and concrete even when STATUS is wrong — "review cycle time with the team" is still reasonable advice even attached to an incorrectly-alarmed healthy week, just unnecessarily anxiety-inducing and noisy if a manager sees it every single week regardless of real status. |

**Net assessment:** this is exactly why Sprint 3/4's original design decision — deterministic scoring as the system of record, AI strictly as an optional, skippable enhancement — was correct, and this evaluation is the evidence for it, not an afterthought. The AI layer does not yet outperform the baseline on the criterion that matters most (risk detection). Per our own Responsible AI commitment (*"if it does not outperform the baseline... the rule-based layer remains the system of record"*), that's exactly the outcome: the deterministic score and early-warning flag stay authoritative, and the AI coaching button stays clearly optional, not a claim of comparable reliability.

## Technical analysis

- **The STATUS line's near-universal false-alarm rate is the primary, actionable finding.** Root cause is very likely that a small instruct model, given a rule to "frame concern as worth investigating," over-applies that framing as a safe default regardless of whether the evidence supports it — consistent with known small-model behavior around hedging/caution-biased outputs. A larger model, few-shot examples showing correct "no concern" outputs, or restructuring the prompt to require an explicit binary classification *before* generating prose, are all plausible fixes — none attempted here.
- **Driver match (33-67%) and number grounding (55-67%) leave real room to improve.** These aren't catastrophic, but a manager can't yet fully trust that the *specific* signal named is the one that actually matters most.
- **The crash bug** (found and fixed mid-evaluation) is the clearest evidence in this entire project for why Sprint 2's deferred requirements around graceful degradation matter operationally, not just architecturally.
- **No ground truth for coaching quality**, as Sprint 3 already named — hence the CSV's two blank human-rating columns rather than a fabricated single accuracy number for "usefulness."
- **Thin real data** — Solstice, the one team with genuine ingested data, has only 1-2 weeks of history; all quantitative evaluation above necessarily used the two synthetic demo teams.
- **Free-tier quota.** 255 calls across configs B/C for this run stayed within Workers AI's free daily allowance; a config D run (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) was scoped but not run in this report to conserve quota — `node scripts/evaluate-coaching.mjs --configs=D` reproduces it if quota allows.
- **What's needed before real end-to-end integration**, in priority order: (1) fix the false-alarm rate — this is the blocking issue, not a nice-to-have; (2) a manager-facing usefulness rating feeding back into prompt iteration; (3) the driver-match and grounding improvements; (4) more real pilot data before trusting any of this on a genuine (not synthetic) decline.

**Caveats on the metrics themselves:** number grounding and comparison-direction are regex-based text checks, not semantic understanding — they can miss paraphrased numbers and unusual phrasing (both `n=1` and `n=2` are excluded from grounding checks since both prompts legitimately reference "one or two signals" and "a 1:1"). Status agreement treats any concern-adjacent language as "flagged," which is a reasonable proxy but not identical to how a human manager would read tone. Full methodology and every raw output is in `eval/results.csv`.

## Repository / demo

- Live: https://growth-3it.pages.dev (click any team's "Get AI coaching suggestion")
- Full raw results: [`eval/results.csv`](./eval/results.csv) (255 rows)
- Reproduce: `node scripts/evaluate-coaching.mjs --configs=A,B,C`
