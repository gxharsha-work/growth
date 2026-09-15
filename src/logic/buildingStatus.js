// Turns a week's computed health row into the short "current status" line
// shown in the details popup. Kept separate from healthScore.js (the
// scoring math) and the popup component (presentation) so this one place
// owns "how do we describe this building's data-driven state in words".
import { CAPABILITY_TYPE_IDS } from '../scene/models'

function trendWord(trend) {
  if (trend > 2) return 'improving'
  if (trend < -2) return 'declining'
  return 'holding steady'
}

/**
 * Returns { headline, detail } for types tied to real signals, or null for
 * purely decorative types (Landmark, Collaboration Road) — the popup omits
 * the status section entirely when this returns null.
 */
export function getBuildingStatus(buildingType, weekHealth) {
  if (!weekHealth) return null

  if (CAPABILITY_TYPE_IDS.includes(buildingType)) {
    const { capabilityScore, capabilityTrend, signals } = weekHealth
    const { avgCycleTimeDays, sprintCompletionPct } = signals.jira
    return {
      headline: `Shipping health: ${capabilityScore}/100, ${trendWord(capabilityTrend)}`,
      detail: `Cycle time ${avgCycleTimeDays.toFixed(1)}d · Sprint completion ${sprintCompletionPct}%`,
    }
  }

  if (buildingType === 'knowledge') {
    const { gardenScore, signals } = weekHealth
    const hours = signals.github.avgReviewTurnaroundHours
    const condition = gardenScore >= 70 ? 'healthy' : gardenScore >= 40 ? 'slowing' : 'bottlenecked'
    return {
      headline: `Review turnaround: ${gardenScore}/100 — ${condition}`,
      detail: `Avg ${hours.toFixed(1)}h to review a PR this week`,
    }
  }

  return null
}
