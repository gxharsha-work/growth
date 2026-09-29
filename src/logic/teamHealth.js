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
  isEarlyWarning,
} from './healthScore'

const cache = new Map()

/**
 * Returns an array of 8 rows for a team, one per week:
 *   {
 *     week, signals,
 *     score,              // 0-100 composite (FR7)
 *     earlyWarning,       // bool (FR9)
 *     capabilityScore,    // 0-100, drives Capability Building
 *     capabilityTrend,    // delta vs previous week (+improving / -declining)
 *     gardenScore,        // 0-100, drives Knowledge Garden
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

  const scores = weeks.map(computeHealthScore)
  const capabilityScores = weeks.map(computeCapabilityScore)

  const rows = weeks.map((signals, i) => {
    const earlyWarning = isEarlyWarning(scores, i)
    return {
      week: signals.week,
      signals,
      score: scores[i],
      earlyWarning,
      capabilityScore: capabilityScores[i],
      capabilityTrend:
        i === 0 ? 0 : capabilityScores[i] - capabilityScores[i - 1],
      gardenScore: computeGardenScore(signals),
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
