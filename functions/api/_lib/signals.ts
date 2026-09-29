// Server-side port of src/data/mockSignals.js + src/data/generatedSignals.js.
// Duplicated rather than imported because Pages Functions bundle this file
// standalone (no access to the Vite app's module graph at the edge), and
// because "what a team's signals are" is now backend-owned — the frontend
// only ever sees the merged weekly rows this file produces, via
// GET /api/teams/:id/signals.
//
// HAND_TUNED_IDS keeps the same two demo narratives the prototype shipped
// with (platform: steady/improving, backend: fine-then-declining) so
// nothing about the existing demo changes. Any other team either has real
// ingested rows in signal_weeks (written by worker-ingestion), or falls
// back to a deterministic per-team-id generated trajectory so a
// freshly-created team is never an empty, dead-looking village.

export const WEEK_COUNT = 8

type JiraSignal = { issueCount: number; avgCycleTimeDays: number; sprintCompletionPct: number; details?: unknown[] }
type GithubSignal = { prCount: number; avgReviewTurnaroundHours: number; pctCommitsAfter7pm: number }
type CalendarSignal = { avgMeetingHoursPerWeek: number; details?: unknown[] }
export type WeekSignals = { week: number; jira: JiraSignal; github: GithubSignal; calendar: CalendarSignal }

// [issueCount, avgCycleTimeDays, sprintCompletionPct, prCount,
//  avgReviewTurnaroundHours, pctCommitsAfter7pm, avgMeetingHoursPerWeek]
const PLATFORM_ROWS: number[][] = [
  [30, 3.4, 78, 18, 9.0, 12, 6.0],
  [31, 3.2, 80, 19, 8.4, 11, 5.8],
  [33, 3.1, 82, 20, 7.8, 10, 5.6],
  [34, 2.9, 84, 21, 7.2, 10, 5.5],
  [35, 2.8, 86, 22, 6.6, 9, 5.3],
  [36, 2.7, 88, 24, 6.0, 9, 5.2],
  [37, 2.6, 90, 25, 5.5, 8, 5.0],
  [38, 2.5, 92, 26, 5.0, 8, 4.8],
]

const BACKEND_ROWS: number[][] = [
  [29, 3.3, 80, 20, 8.0, 10, 6.0],
  [30, 3.2, 81, 21, 7.6, 11, 6.3],
  [31, 3.3, 79, 20, 8.0, 10, 6.1],
  [32, 3.6, 74, 19, 10.0, 14, 8.0],
  [35, 4.2, 66, 17, 13.0, 19, 10.2],
  [39, 5.0, 58, 15, 17.0, 25, 12.6],
  [43, 5.8, 50, 13, 21.0, 31, 15.1],
  [47, 6.5, 44, 11, 26.0, 37, 17.5],
]

function buildWeeks(rows: number[][]): WeekSignals[] {
  return rows.map((row, i) => {
    const [issueCount, avgCycleTimeDays, sprintCompletionPct, prCount, avgReviewTurnaroundHours, pctCommitsAfter7pm, avgMeetingHoursPerWeek] = row
    return {
      week: i + 1,
      jira: { issueCount, avgCycleTimeDays, sprintCompletionPct },
      github: { prCount, avgReviewTurnaroundHours, pctCommitsAfter7pm },
      calendar: { avgMeetingHoursPerWeek },
    }
  })
}

export const HAND_TUNED_IDS = new Set(['platform', 'backend'])
const HAND_TUNED: Record<string, WeekSignals[]> = {
  platform: buildWeeks(PLATFORM_ROWS),
  backend: buildWeeks(BACKEND_ROWS),
}

// --- deterministic generated fallback (same algorithm as generatedSignals.js) ---

function hashString(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generateWeeklyRows(teamId: string): number[][] {
  const rand = mulberry32(hashString(teamId))
  const roll = rand()
  const trend = roll < 0.34 ? -1 : roll < 0.67 ? 1 : 0
  const slope = trend * (0.4 + rand() * 0.6)

  let issueCount = 24 + Math.round(rand() * 14)
  let cycleTime = 2.6 + rand() * 2.4
  let sprintPct = 68 + Math.round(rand() * 20)
  let prCount = 14 + Math.round(rand() * 10)
  let reviewHours = 6 + rand() * 8
  let afterHoursPct = 6 + Math.round(rand() * 14)
  let meetingHours = 4.5 + rand() * 4

  const rows: number[][] = []
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

const PENDING_GITHUB: GithubSignal = { prCount: 0, avgReviewTurnaroundHours: 12, pctCommitsAfter7pm: 15 }
const PENDING_CALENDAR: CalendarSignal = { avgMeetingHoursPerWeek: 6 }

type Row = { iso_week: string; source: string; payload: string }

// Merges D1's per-(week, source) rows into the weekly array shape the
// frontend has always consumed. Jira is the anchor signal (a week with
// calendar data but no jira data has nothing to show — healthScore.js
// requires signals.jira), matching mockSignals.js's original merge rule.
function mergeIngestedRows(rows: Row[]): WeekSignals[] {
  const jiraByWeek = new Map<string, JiraSignal>()
  const calendarByWeek = new Map<string, CalendarSignal>()
  for (const r of rows) {
    if (r.source === 'jira') jiraByWeek.set(r.iso_week, JSON.parse(r.payload))
    if (r.source === 'calendar') calendarByWeek.set(r.iso_week, JSON.parse(r.payload))
  }
  return [...jiraByWeek.keys()]
    .sort()
    .map((isoWeek, i) => ({
      week: i + 1,
      jira: jiraByWeek.get(isoWeek)!,
      github: PENDING_GITHUB,
      calendar: calendarByWeek.get(isoWeek) ?? PENDING_CALENDAR,
    }))
}

export type SignalSource = 'hand-tuned' | 'live' | 'generated'

export async function getSignalsForTeam(
  db: D1Database,
  teamId: string
): Promise<{ weeks: WeekSignals[]; source: SignalSource }> {
  if (HAND_TUNED_IDS.has(teamId)) {
    return { weeks: HAND_TUNED[teamId], source: 'hand-tuned' }
  }

  const { results } = await db
    .prepare('SELECT iso_week, source, payload FROM signal_weeks WHERE team_id = ?')
    .bind(teamId)
    .all<Row>()

  if (results && results.length > 0) {
    const weeks = mergeIngestedRows(results)
    if (weeks.length > 0) return { weeks, source: 'live' }
  }

  return { weeks: buildWeeks(generateWeeklyRows(teamId)), source: 'generated' }
}
