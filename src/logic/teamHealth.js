// Bridges the mock data layer (/src/data) and the scoring module
// (healthScore.js) into one ready-to-render row per team per week. UI code
// should read from here rather than calling healthScore.js directly, so the
// scoring math and the data shape stay decoupled from components.

import { useSignalsStore } from '../store/signalsStore'
import {
  computeHealthScore,
  computeCapabilityScore,
  computeGardenScore,
  computeWeatherState,
  computeDataCoverage,
  MIN_COVERAGE,
  isEarlyWarning,
} from './healthScore'
import { explainWeek } from './earlyWarningExplain'

import { healthCache as cache } from './teamHealthCache'

/**
 * Returns an array of 8 rows for a team, one per week:
 *   {
 *     week, signals,
 *     score,              // 0-100 composite (FR7)
 *     earlyWarning,       // bool (FR9)
 *     capabilityScore,    // 0-100, drives Capability Building
 *     capabilityTrend,    // delta vs previous week (+improving / -declining)
 *     gardenScore,        // 0-100, drives Knowledge Garden; null = no GitHub data
 *     weather,            // 'sunny' | 'partly-cloudy' | 'rain'
 *   }
 */
export function getTeamWeeklyHealth(teamId) {
  if (cache.has(teamId)) return cache.get(teamId)

  // Signals load asynchronously (see signalsStore.js's ensureSignals) — an
  // empty array here means "not loaded yet, not a team with zero weeks",
  // so it's deliberately never cached: the next call (triggered by the
  // re-render once signals arrive) recomputes and caches for real.
  const weeks = useSignalsStore.getState().weeklyByTeam[teamId] ?? []
  if (weeks.length === 0) return []

  const scores = weeks.map((w) => computeHealthScore(w, w.sources))
  const capabilityScores = weeks.map((w) => computeCapabilityScore(w, w.sources))

  const rows = weeks.map((signals, i) => {
    const earlyWarning = isEarlyWarning(scores, i)
    const coverage = computeDataCoverage(signals.sources)
    return {
      week: signals.week,
      period: signals.period ?? null, // sprint/week label for the timeline
      signals,
      sources: signals.sources ?? null, // provenance, for the HUD source tags
      score: scores[i],
      earlyWarning,
      coverage, // share of score weight from counted signals (0-1)
      enoughData: coverage >= MIN_COVERAGE, // false -> UI shows "Not enough data"
      capabilityScore: capabilityScores[i],
      capabilityTrend:
        i === 0 || capabilityScores[i] == null || capabilityScores[i - 1] == null
          ? 0
          : capabilityScores[i] - capabilityScores[i - 1],
      // The garden listens only to GitHub review turnaround. Without a counted
      // GitHub source it has no data of its own: null, never placeholder numbers.
      gardenScore: ['live', 'demo'].includes(signals.sources?.github ?? 'demo') ? computeGardenScore(signals) : null,
      weather: computeWeatherState(scores[i], signals, earlyWarning),
    }
  })

  cache.set(teamId, rows)
  return rows
}

export function getTeamWeek(teamId, weekIndex) {
  const rows = getTeamWeeklyHealth(teamId)
  return rows[Math.max(0, Math.min(rows.length - 1, weekIndex))] ?? null
}

// Rule result for one week in plain words (threshold, baseline, drivers).
// See earlyWarningExplain.js; null until the team's signals have loaded.
export function getWeekExplanation(teamId, weekIndex) {
  const rows = getTeamWeeklyHealth(teamId)
  if (rows.length === 0) return null
  return explainWeek(rows, Math.max(0, Math.min(rows.length - 1, weekIndex)))
}
