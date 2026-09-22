// Deterministic per-team fallback signal generator for teams with no
// hand-tuned or ingested data (see mockSignals.js's getWeeklySignalsForTeam).
// A team's id is hashed to seed a PRNG, so the same team id always produces
// the same 8-week trajectory across reloads, but different team ids look
// visibly different from each other (some trending up, some down, some
// flat) — no new dependency, just a small hash + PRNG.

const WEEK_COUNT = 8

function hashString(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Row shape matches mockSignals.js's PLATFORM_ROWS:
// [issueCount, avgCycleTimeDays, sprintCompletionPct, prCount,
//  avgReviewTurnaroundHours, pctCommitsAfter7pm, avgMeetingHoursPerWeek]
export function generateWeeklyRows(teamId) {
  const rand = mulberry32(hashString(String(teamId)))
  const roll = rand()
  const trend = roll < 0.34 ? -1 : roll < 0.67 ? 1 : 0 // declining / improving / flat
  const slope = trend * (0.4 + rand() * 0.6)

  let issueCount = 24 + Math.round(rand() * 14)
  let cycleTime = 2.6 + rand() * 2.4
  let sprintPct = 68 + Math.round(rand() * 20)
  let prCount = 14 + Math.round(rand() * 10)
  let reviewHours = 6 + rand() * 8
  let afterHoursPct = 6 + Math.round(rand() * 14)
  let meetingHours = 4.5 + rand() * 4

  const rows = []
  for (let w = 0; w < WEEK_COUNT; w++) {
    const n = () => rand() - 0.5
    rows.push([
      Math.max(8, Math.round(issueCount + n() * 2)),
      Math.max(0.8, +(cycleTime + n() * 0.3).toFixed(1)),
      Math.min(100, Math.max(20, Math.round(sprintPct + n() * 3))),
      Math.max(4, Math.round(prCount + n() * 2)),
      Math.max(1, +(reviewHours + n() * 1.2).toFixed(1)),
      Math.min(60, Math.max(0, Math.round(afterHoursPct + n() * 3))),
      Math.max(2, +(meetingHours + n() * 0.6).toFixed(1)),
    ])
    issueCount += slope * 0.6
    cycleTime -= slope * 0.18
    sprintPct += slope * 2.2
    prCount += slope * 0.4
    reviewHours -= slope * 0.7
    afterHoursPct -= slope * 1.1
    meetingHours -= slope * 0.15
  }
  return rows
}
