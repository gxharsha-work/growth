// ---------------------------------------------------------------------------
// PLACEHOLDER SCORING MODULE (FR7)
//
// This is a simple, transparent weighted average over a handful of mock
// signals — NOT a validated model of team health. It exists to prove the
// data -> score -> visual pipeline end to end. The shape (one function that
// takes a week of signals and returns 0-100) is what should stay stable;
// the actual math inside is expected to be replaced by a real model later
// (informed by real Jira/GitHub/calendar data, and eventually the AI-authored
// coaching layer). Treat every number in this file as tunable, not final.
// ---------------------------------------------------------------------------

// --- normalization ----------------------------------------------------------
// Each raw metric is mapped onto a 0-100 "goodness" scale before weighting,
// so metrics with very different units/ranges (days, hours, %) can be
// combined meaningfully. `goodAt`/`badAt` are the placeholder thresholds.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// For metrics where LOWER is better (cycle time, review turnaround, etc).
function scoreLowerIsBetter(value, goodAt, badAt) {
  const t = (badAt - value) / (badAt - goodAt)
  return clamp(t * 100, 0, 100)
}

// For metrics that already read as a 0-100 "higher is better" percentage.
function scoreHigherIsBetter(valuePct) {
  return clamp(valuePct, 0, 100)
}

// Placeholder normalization thresholds — adjust as real distributions come in.
export const THRESHOLDS = {
  cycleTimeDays: { good: 1.5, bad: 7 },
  reviewTurnaroundHours: { good: 3, bad: 28 },
  pctCommitsAfter7pm: { good: 5, bad: 40 },
  meetingHoursPerWeek: { good: 5, bad: 18 },
}

export function normalizeCycleTime(days) {
  const { good, bad } = THRESHOLDS.cycleTimeDays
  return scoreLowerIsBetter(days, good, bad)
}

export function normalizeCompletion(pct) {
  return scoreHigherIsBetter(pct)
}

export function normalizeReviewTurnaround(hours) {
  const { good, bad } = THRESHOLDS.reviewTurnaroundHours
  return scoreLowerIsBetter(hours, good, bad)
}

export function normalizeAfterHoursCommits(pct) {
  const { good, bad } = THRESHOLDS.pctCommitsAfter7pm
  return scoreLowerIsBetter(pct, good, bad)
}

export function normalizeMeetingLoad(hours) {
  const { good, bad } = THRESHOLDS.meetingHoursPerWeek
  return scoreLowerIsBetter(hours, good, bad)
}

// --- composite score (FR7) ---------------------------------------------------
// Weighted average across Jira (40%), GitHub (40%), and Calendar (20%).
// Weights are a placeholder split, not a derived/validated weighting.
export const WEIGHTS = {
  cycleTime: 0.2,
  completion: 0.2,
  reviewTurnaround: 0.25,
  afterHoursCommits: 0.15,
  meetingLoad: 0.2,
}

/**
 * Composite 0-100 health score for one team, one week.
 * `weekSignals` is one entry from data/mockSignals.js:
 *   { jira: {...}, github: {...}, calendar: {...} }
 */
export function computeHealthScore(weekSignals) {
  const { jira, github, calendar } = weekSignals

  const cycleScore = normalizeCycleTime(jira.avgCycleTimeDays)
  const completionScore = normalizeCompletion(jira.sprintCompletionPct)
  const reviewScore = normalizeReviewTurnaround(
    github.avgReviewTurnaroundHours
  )
  const afterHoursScore = normalizeAfterHoursCommits(
    github.pctCommitsAfter7pm
  )
  const meetingScore = normalizeMeetingLoad(calendar.avgMeetingHoursPerWeek)

  const composite =
    cycleScore * WEIGHTS.cycleTime +
    completionScore * WEIGHTS.completion +
    reviewScore * WEIGHTS.reviewTurnaround +
    afterHoursScore * WEIGHTS.afterHoursCommits +
    meetingScore * WEIGHTS.meetingLoad

  return Math.round(clamp(composite, 0, 100))
}

// --- narrower sub-scores, used to drive specific visuals --------------------
// These reuse the same normalization but only look at the signals that make
// sense for a given building's "story" (see CONNECTING SCORE TO VISUALS).

// Jira + GitHub only (no calendar) — how well the team is actually shipping.
// Drives the Capability Building's level/condition.
export function computeCapabilityScore(weekSignals) {
  const { jira, github } = weekSignals
  const cycleScore = normalizeCycleTime(jira.avgCycleTimeDays)
  const completionScore = normalizeCompletion(jira.sprintCompletionPct)
  const reviewScore = normalizeReviewTurnaround(
    github.avgReviewTurnaroundHours
  )
  const afterHoursScore = normalizeAfterHoursCommits(
    github.pctCommitsAfter7pm
  )
  const composite =
    cycleScore * 0.3 +
    completionScore * 0.3 +
    reviewScore * 0.25 +
    afterHoursScore * 0.15
  return Math.round(clamp(composite, 0, 100))
}

// Review turnaround only — "knowledge is bottlenecked with fewer reviewers
// keeping up" is specifically a review-speed story, so the garden listens
// to just that one signal.
export function computeGardenScore(weekSignals) {
  return Math.round(
    normalizeReviewTurnaround(weekSignals.github.avgReviewTurnaroundHours)
  )
}

// Sunny / partly-cloudy / rain — the scene's clearest "at a glance" signal.
// Tiered primarily off the composite health score:
//   80+          -> sunny
//   60-79        -> partly-cloudy
//   below 60, or an early-warning week -> rain (overcast lighting + rain)
// Meeting load is a secondary nudge: even a strong-scoring week reads as
// partly-cloudy if the team is buried in meetings, so the "why" behind a
// heavy calendar is still visible even before the score itself drops.
const HEAVY_MEETING_HOURS = 10

export function computeWeatherState(score, weekSignals, earlyWarning) {
  if (earlyWarning || score < 60) return 'rain'
  if (score < 80) return 'partly-cloudy'
  if (weekSignals.calendar.avgMeetingHoursPerWeek >= HEAVY_MEETING_HOURS) {
    return 'partly-cloudy'
  }
  return 'sunny'
}

// --- early warning (FR9) -----------------------------------------------------
// Flags a week where the team's score dropped more than 15% below its own
// trailing 3-week average — a simple, self-relative threshold rather than a
// cross-team one, so each team is judged against its own recent normal.

export function getTrailingAverage(scores, index, windowSize = 3) {
  const start = index - windowSize
  if (start < 0) return null
  const window = scores.slice(start, index)
  if (window.length === 0) return null
  return window.reduce((sum, v) => sum + v, 0) / window.length
}

export function isEarlyWarning(scores, index) {
  const trailing = getTrailingAverage(scores, index)
  if (trailing == null) return false
  return scores[index] < trailing * 0.85
}
