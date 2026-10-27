// Scenario library for the E2 seeded-scenario evaluation (see
// report/validation_report.md). This file is DATA, not detector logic, so a
// teammate who did not tune the detector can author the held-out library
// without touching simulate.mjs (Wu & Keogh's guardrail: the people who tune
// the detector should not author the test scenarios).
//
// Every scenario is a set of effects layered onto a healthy synthetic team:
//   mode 'mul'  -> value * (1 + eff)      mode 'add' -> value + eff
//   amount      -> effect size at full strength (units of the signal for 'add')
//   rampIn      -> weeks to reach full strength (1 = abrupt step)
//   decay       -> fraction of the effect that fades by the end of `duration`
//                  (a team adapting to a shock); ignored for permanent effects
// `duration` is how many weeks the episode lasts (Infinity = permanent new
// normal, e.g. a team that grew). `kind` decides how a result is read:
//   strain  - a real decline the detector SHOULD catch
//   benign  - a confounder the detector should NOT fire on
//   chronic - a team that is bad but stable (no change to detect)
//   null    - healthy, nothing happens (false-alarm denominator)

export const WEEKS = 52

// Healthy-team baselines are drawn uniformly from these ranges. They are wider
// than src/data/generatedSignals.js on purpose: between-team variation matters
// because a healthy team can score low (the live Solstice team scores 57), and
// a first DEV run with narrower ranges gave a misleadingly clean result for the
// fixed-cutoff rule (no healthy team ever scored under 60). This was changed
// after inspecting the DEV set and before the HELD-OUT set was run.
export const BASELINE_RANGES = {
  cycleTime: [2.4, 6.0], // days
  completion: [55, 90], // %
  reviewTurnaround: [5, 18], // hours
  afterHours: [5, 25], // % of commits after 7pm
  meeting: [4.5, 11], // hours / week
}

// A chronically unhealthy but flat team (E11).
export const CHRONIC_LOW_BASELINE = {
  cycleTime: 6.2,
  completion: 42,
  reviewTurnaround: 22,
  afterHours: 32,
  meeting: 14,
}

// Week-to-week noise (stationary std-dev) at noiseScale = 1. THESE ARE
// ASSUMPTIONS: the only real weekly series we have is one Solstice sprint, so
// simulate.mjs sweeps noiseScale (0.25 ~ the repo's existing generator,
// 1 = our "realistic" setting, 1.6 = noisy) rather than trusting one value.
export const NOISE_SD = {
  cycleTime: 0.5,
  completion: 4,
  reviewTurnaround: 1.8,
  afterHours: 3,
  meeting: 0.9,
}

const strain = (id, severity, effects, duration = 12) => ({ kind: 'strain', id, severity, duration, effects })
const benign = (id, duration, effects) => ({ kind: 'benign', id, severity: '-', duration, effects })

// ---------------------------------------------------------------------------
// DEV library: used while building and sanity-checking the harness.
// ---------------------------------------------------------------------------
const DEV = [
  // gradual creep across cycle time + after-hours + completion
  strain('slow_burnout', 'subtle', {
    cycleTime: { mode: 'mul', amount: 0.35, rampIn: 12 },
    afterHours: { mode: 'add', amount: 8, rampIn: 12 },
    completion: { mode: 'add', amount: -8, rampIn: 12 },
  }),
  strain('slow_burnout', 'clear', {
    cycleTime: { mode: 'mul', amount: 0.8, rampIn: 12 },
    afterHours: { mode: 'add', amount: 20, rampIn: 12 },
    completion: { mode: 'add', amount: -20, rampIn: 12 },
  }),
  // abrupt drop in completion + review turnaround spike, partly adapted to
  strain('key_person_departure', 'subtle', {
    completion: { mode: 'add', amount: -12, rampIn: 1, decay: 0.4 },
    reviewTurnaround: { mode: 'mul', amount: 0.6, rampIn: 1, decay: 0.4 },
    cycleTime: { mode: 'mul', amount: 0.25, rampIn: 1, decay: 0.4 },
  }),
  strain('key_person_departure', 'clear', {
    completion: { mode: 'add', amount: -28, rampIn: 1, decay: 0.4 },
    reviewTurnaround: { mode: 'mul', amount: 1.5, rampIn: 1, decay: 0.4 },
    cycleTime: { mode: 'mul', amount: 0.6, rampIn: 1, decay: 0.4 },
  }),
  // meeting-load surge only (re-org / planning season)
  strain('meeting_surge', 'subtle', { meeting: { mode: 'add', amount: 4, rampIn: 2 } }),
  strain('meeting_surge', 'clear', { meeting: { mode: 'add', amount: 9, rampIn: 2 } }),
  // one reviewer becomes the bottleneck: only review turnaround moves
  strain('knowledge_concentration', 'subtle', { reviewTurnaround: { mode: 'mul', amount: 0.8, rampIn: 12 } }),
  strain('knowledge_concentration', 'clear', { reviewTurnaround: { mode: 'mul', amount: 1.8, rampIn: 12 } }),

  // benign confounders that should NOT alert
  benign('holiday_week', 2, {
    completion: { mode: 'add', amount: -20, rampIn: 1 },
    reviewTurnaround: { mode: 'mul', amount: 0.5, rampIn: 1 },
    meeting: { mode: 'mul', amount: -0.6, rampIn: 1 },
    cycleTime: { mode: 'mul', amount: 0.1, rampIn: 1 },
  }),
  benign('planned_hardening_sprint', 2, {
    completion: { mode: 'add', amount: -25, rampIn: 1 },
    cycleTime: { mode: 'mul', amount: 0.4, rampIn: 1 },
  }),
  benign('team_growth', Infinity, {
    meeting: { mode: 'mul', amount: 0.3, rampIn: 4 },
    reviewTurnaround: { mode: 'mul', amount: 0.2, rampIn: 4 },
    cycleTime: { mode: 'mul', amount: 0.1, rampIn: 4 },
  }),

  { kind: 'chronic', id: 'chronic_low', severity: '-', duration: 0, effects: {}, baseline: CHRONIC_LOW_BASELINE },
]

// ---------------------------------------------------------------------------
// HELD-OUT library: same scenario families, DIFFERENT realizations (different
// signal mixes, shapes and magnitudes) and a disjoint seed range. Detector
// rules are frozen before this set is run, and it is run once. It was written
// by the same author as DEV (see Limitations in the report) - a teammate should
// replace or extend it; only this file needs to change.
// ---------------------------------------------------------------------------
const HELDOUT = [
  // "quiet" burnout: output is held up by overtime, so completion/cycle stay flat
  strain('slow_burnout', 'subtle', {
    afterHours: { mode: 'add', amount: 6, rampIn: 12 },
    meeting: { mode: 'add', amount: 2.5, rampIn: 12 },
  }),
  strain('slow_burnout', 'clear', {
    afterHours: { mode: 'add', amount: 15, rampIn: 12 },
    meeting: { mode: 'add', amount: 6, rampIn: 12 },
    cycleTime: { mode: 'mul', amount: 0.3, rampIn: 12 },
  }),
  // review stalls + cycle time, but completion is protected by scope cuts
  strain('key_person_departure', 'subtle', {
    reviewTurnaround: { mode: 'mul', amount: 0.9, rampIn: 2, decay: 0.3 },
    cycleTime: { mode: 'mul', amount: 0.3, rampIn: 2, decay: 0.3 },
  }),
  strain('key_person_departure', 'clear', {
    reviewTurnaround: { mode: 'mul', amount: 2.0, rampIn: 2, decay: 0.3 },
    cycleTime: { mode: 'mul', amount: 0.7, rampIn: 2, decay: 0.3 },
    completion: { mode: 'add', amount: -15, rampIn: 2, decay: 0.3 },
  }),
  // meeting load creeping up over six weeks instead of a step
  strain('meeting_surge', 'subtle', { meeting: { mode: 'add', amount: 3.5, rampIn: 6 } }),
  strain('meeting_surge', 'clear', { meeting: { mode: 'add', amount: 8, rampIn: 6 } }),
  // steeper review stall plus a small completion cost
  strain('knowledge_concentration', 'subtle', {
    reviewTurnaround: { mode: 'mul', amount: 1.1, rampIn: 12 },
    completion: { mode: 'add', amount: -3, rampIn: 12 },
  }),
  strain('knowledge_concentration', 'clear', {
    reviewTurnaround: { mode: 'mul', amount: 2.2, rampIn: 12 },
    completion: { mode: 'add', amount: -6, rampIn: 12 },
  }),

  benign('holiday_week', 1, {
    completion: { mode: 'add', amount: -35, rampIn: 1 },
    meeting: { mode: 'mul', amount: -0.7, rampIn: 1 },
    reviewTurnaround: { mode: 'mul', amount: 0.7, rampIn: 1 },
  }),
  benign('planned_hardening_sprint', 3, {
    completion: { mode: 'add', amount: -22, rampIn: 1 },
    cycleTime: { mode: 'mul', amount: 0.5, rampIn: 1 },
    afterHours: { mode: 'add', amount: 4, rampIn: 1 },
  }),
  benign('team_growth', Infinity, {
    meeting: { mode: 'mul', amount: 0.45, rampIn: 5 },
    reviewTurnaround: { mode: 'mul', amount: 0.3, rampIn: 5 },
    cycleTime: { mode: 'mul', amount: 0.15, rampIn: 5 },
    completion: { mode: 'add', amount: -4, rampIn: 5 },
  }),

  {
    kind: 'chronic',
    id: 'chronic_low',
    severity: '-',
    duration: 0,
    effects: {},
    baseline: { cycleTime: 5.5, completion: 50, reviewTurnaround: 19, afterHours: 27, meeting: 12 },
  },
]

export const LIBRARY = { dev: DEV, heldout: HELDOUT }
