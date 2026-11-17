// Plain-language explanation of one week's early-warning result (FR9, IT-02/IT-03).
//
// This module never decides anything: the flag comes from isEarlyWarning and
// the baseline from getTrailingAverage in healthScore.js, unchanged. It only
// turns that result into text a manager can check:
//   - the active rule, with the numbers it used (score, 3-week average, threshold)
//   - when the rule fired, the signals whose contribution fell the most
//
// Threshold shown = ceil(0.85 x average). Scores are whole numbers, so
// "score < 0.85 x average" holds exactly when "score < shown threshold".

import {
  getTrailingAverage,
  isEarlyWarning,
  normalizeCycleTime,
  normalizeCompletion,
  normalizeReviewTurnaround,
  normalizeAfterHoursCommits,
  normalizeMeetingLoad,
  WEIGHTS,
} from './healthScore'

export const EARLY_WARNING_RATIO = 0.85 // mirrors isEarlyWarning; test-early-warning-text.mjs checks they agree
export const BASELINE_WEEKS = 3
export const RULE_TEXT = `Flags a week when the score falls below ${EARLY_WARNING_RATIO * 100}% of the team's own average over the previous ${BASELINE_WEEKS} weeks.`

const SIGNALS = [
  { key: 'cycleTime', label: 'cycle time', unit: ' days', value: (w) => w.jira.avgCycleTimeDays, norm: normalizeCycleTime, source: (s) => s?.jira },
  { key: 'completion', label: 'sprint completion', unit: '%', value: (w) => w.jira.sprintCompletionPct, norm: normalizeCompletion, source: (s) => s?.jira },
  { key: 'reviewTurnaround', label: 'review turnaround', unit: ' h', value: (w) => w.github.avgReviewTurnaroundHours, norm: normalizeReviewTurnaround, source: (s) => s?.github },
  { key: 'afterHoursCommits', label: 'after-hours commits', unit: '%', value: (w) => w.github.pctCommitsAfter7pm, norm: normalizeAfterHoursCommits, source: (s) => s?.github },
  { key: 'meetingLoad', label: 'meeting load', unit: ' h', value: (w) => w.calendar.avgMeetingHoursPerWeek, norm: normalizeMeetingLoad, source: (s) => s?.calendar },
]

// Same inclusion rule as the scorer: placeholder or missing sources do not count.
const counts = (sources, sig) => !sources || ['live', 'demo'].includes(sig.source(sources))
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const fmt = (n) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1))

/**
 * rows: one team's weekly rows from getTeamWeeklyHealth ({ score, signals, sources }).
 * Returns { flagged, hasBaseline, score, baseline, threshold, drivers, headline, baselineLine, rule }.
 */
export function explainWeek(rows, index) {
  const scores = rows.map((r) => r.score)
  const row = rows[index]
  const score = row.score
  const trailing = getTrailingAverage(scores, index, BASELINE_WEEKS)
  const flagged = isEarlyWarning(scores, index)

  if (trailing == null) {
    return {
      flagged,
      hasBaseline: false,
      score,
      baseline: null,
      threshold: null,
      drivers: [],
      rule: RULE_TEXT,
      headline: null,
      baselineLine: `Score ${score}. Early warning starts after ${BASELINE_WEEKS} weeks of data (this is week ${index + 1}).`,
    }
  }

  const baseline = Math.round(trailing)
  const threshold = Math.ceil(trailing * EARLY_WARNING_RATIO)
  const prev = rows.slice(index - BASELINE_WEEKS, index)

  // Weighted fall in each counted signal's 0-100 contribution vs its own 3-week average.
  const drivers = SIGNALS.filter((sig) => counts(row.sources, sig))
    .map((sig) => {
      const before = mean(prev.map((r) => sig.value(r.signals)))
      const now = sig.value(row.signals)
      const fall = (mean(prev.map((r) => sig.norm(sig.value(r.signals)))) - sig.norm(now)) * WEIGHTS[sig.key]
      return { key: sig.key, label: sig.label, before, now, fall, text: `${sig.label} ${fmt(before)} to ${fmt(now)}${sig.unit}` }
    })
    .filter((d) => d.fall > 0.5)
    .sort((a, b) => b.fall - a.fall)
    .slice(0, 2)

  const because = drivers.length ? ` Biggest drops: ${drivers.map((d) => d.text).join('; ')}.` : ''
  return {
    flagged,
    hasBaseline: true,
    score,
    baseline,
    threshold,
    drivers,
    rule: RULE_TEXT,
    headline: flagged
      ? `Early warning: score ${score} is below the threshold of ${threshold} (85% of the 3-week average, ${baseline}).${because}`
      : null,
    baselineLine: `Score ${score} vs 3-week average ${baseline}, threshold ${threshold}. ${flagged ? 'Below the threshold: early warning on.' : 'At or above the threshold: no early warning.'}`,
  }
}
