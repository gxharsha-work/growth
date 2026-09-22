// Turns a week's computed health row into the "current status" shown in the
// details popup. Kept separate from healthScore.js (the scoring math) and
// the popup component (presentation) so this one place owns how a
// building's data-driven state is described in words.

function trendWord(trend) {
  if (trend > 2) return 'improving'
  if (trend < -2) return 'declining'
  return 'holding steady'
}

export function levelFor(score) {
  if (score >= 70) return 'good'
  if (score >= 45) return 'ok'
  return 'low'
}

/**
 * Status for one placed capability. Every capability currently reflects the
 * team's overall shipping health; per-capability signals (e.g. mapping Jira
 * components to a capability) would slot in here.
 */
export function getCapabilityStatus(weekHealth) {
  if (!weekHealth) return null
  const { capabilityScore, capabilityTrend, signals } = weekHealth
  const { avgCycleTimeDays, sprintCompletionPct } = signals.jira
  return {
    score: capabilityScore,
    level: levelFor(capabilityScore),
    headline: `Shipping health ${capabilityScore} · ${trendWord(capabilityTrend)}`,
    detail: `Cycle time ${avgCycleTimeDays.toFixed(1)}d · Sprint completion ${sprintCompletionPct}%`,
  }
}

/** Status for the shared Knowledge Commons (driven by code-review speed). */
export function getCommonsStatus(weekHealth) {
  if (!weekHealth) return null
  const { gardenScore, signals } = weekHealth
  const hours = signals.github.avgReviewTurnaroundHours
  const condition = gardenScore >= 70 ? 'flowing' : gardenScore >= 40 ? 'slowing' : 'bottlenecked'
  return {
    score: gardenScore,
    level: levelFor(gardenScore),
    headline: `Knowledge flow ${gardenScore} · ${condition}`,
    detail: `Reviews take about ${hours.toFixed(1)}h to come back this week`,
  }
}
