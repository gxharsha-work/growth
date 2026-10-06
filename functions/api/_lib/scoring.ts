// Server-side port of src/logic/healthScore.js. The browser keeps its own copy
// for rendering; this one is authoritative for anything sent to the model,
// so the AI can only ever be given numbers the server actually computed.
// scripts/test-scoring-parity.mjs asserts the two stay identical.
//
// Kept line-for-line with the client on purpose. Changing the math (e.g.
// rescaling weights when a source is missing) happens in both places together.

import type { WeekSignals } from './signals'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function scoreLowerIsBetter(value: number, goodAt: number, badAt: number) {
  const t = (badAt - value) / (badAt - goodAt)
  return clamp(t * 100, 0, 100)
}

export const THRESHOLDS = {
  cycleTimeDays: { good: 1.5, bad: 7 },
  reviewTurnaroundHours: { good: 3, bad: 28 },
  pctCommitsAfter7pm: { good: 5, bad: 40 },
  meetingHoursPerWeek: { good: 5, bad: 18 },
}

export const WEIGHTS = {
  cycleTime: 0.2,
  completion: 0.2,
  reviewTurnaround: 0.25,
  afterHoursCommits: 0.15,
  meetingLoad: 0.2,
}

export const normalizeCycleTime = (days: number) =>
  scoreLowerIsBetter(days, THRESHOLDS.cycleTimeDays.good, THRESHOLDS.cycleTimeDays.bad)
export const normalizeCompletion = (pct: number) => clamp(pct, 0, 100)
export const normalizeReviewTurnaround = (hours: number) =>
  scoreLowerIsBetter(hours, THRESHOLDS.reviewTurnaroundHours.good, THRESHOLDS.reviewTurnaroundHours.bad)
export const normalizeAfterHoursCommits = (pct: number) =>
  scoreLowerIsBetter(pct, THRESHOLDS.pctCommitsAfter7pm.good, THRESHOLDS.pctCommitsAfter7pm.bad)
export const normalizeMeetingLoad = (hours: number) =>
  scoreLowerIsBetter(hours, THRESHOLDS.meetingHoursPerWeek.good, THRESHOLDS.meetingHoursPerWeek.bad)

export function computeHealthScore(w: WeekSignals): number {
  const composite =
    normalizeCycleTime(w.jira.avgCycleTimeDays) * WEIGHTS.cycleTime +
    normalizeCompletion(w.jira.sprintCompletionPct) * WEIGHTS.completion +
    normalizeReviewTurnaround(w.github.avgReviewTurnaroundHours) * WEIGHTS.reviewTurnaround +
    normalizeAfterHoursCommits(w.github.pctCommitsAfter7pm) * WEIGHTS.afterHoursCommits +
    normalizeMeetingLoad(w.calendar.avgMeetingHoursPerWeek) * WEIGHTS.meetingLoad
  return Math.round(clamp(composite, 0, 100))
}

export function computeCapabilityScore(w: WeekSignals): number {
  const composite =
    normalizeCycleTime(w.jira.avgCycleTimeDays) * 0.3 +
    normalizeCompletion(w.jira.sprintCompletionPct) * 0.3 +
    normalizeReviewTurnaround(w.github.avgReviewTurnaroundHours) * 0.25 +
    normalizeAfterHoursCommits(w.github.pctCommitsAfter7pm) * 0.15
  return Math.round(clamp(composite, 0, 100))
}

export function getTrailingAverage(scores: number[], index: number, windowSize = 3): number | null {
  const start = index - windowSize
  if (start < 0) return null
  const window = scores.slice(start, index)
  if (window.length === 0) return null
  return window.reduce((sum, v) => sum + v, 0) / window.length
}

export function isEarlyWarning(scores: number[], index: number): boolean {
  const trailing = getTrailingAverage(scores, index)
  if (trailing == null) return false
  return scores[index] < trailing * 0.85
}
