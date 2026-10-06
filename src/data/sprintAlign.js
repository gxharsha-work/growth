// Sprint-boundary alignment for the live Jira signals.
//
// Jira's two headline signals — cycle time and sprint completion — are *sprint*
// concepts, but the pipeline used to bucket them into whichever ISO *calendar*
// week an ingest happened to run in. That drifted: a 2-week sprint produced two
// "weekly" snapshots of the same unfinished sprint, and completion % was always
// a mid-sprint reading rather than the sprint's final, boundary-aligned value.
//
// The ingest now emits one row per real sprint, tagged with the sprint's own
// start/end from the board. Calendar meeting-load stays genuinely weekly, so at
// merge time we fold the weekly calendar rows into each sprint window (averaging
// the weeks whose midpoint falls inside the sprint). Every merged row is then
// internally consistent and the timeline steps by sprint boundary.
//
// This module is the single source of that math. The browser merge
// (mockSignals.js) imports it directly; the server (functions/api/_lib/signals.ts)
// and the cron worker (worker-ingestion/src/sprintAlign.ts) carry ported copies —
// keep all three in sync.

// Thursday of an ISO week (YYYY-Www) is its canonical in-year day: using it to
// test sprint membership assigns each calendar week to exactly one sprint, even
// when the week straddles a sprint boundary. Returns epoch ms (UTC), or NaN for
// a malformed label.
export function isoWeekThursdayMs(isoWeek) {
  const m = /^(\d{4})-W(\d{2})$/.exec(isoWeek ?? '')
  if (!m) return NaN
  const year = Number(m[1])
  const week = Number(m[2])
  // Jan 4th is always in ISO week 1; step back to that week's Thursday, then
  // add whole weeks to reach the target week's Thursday.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Dow = jan4.getUTCDay() || 7 // Mon=1..Sun=7
  const thursday = new Date(jan4)
  thursday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 4) + (week - 1) * 7)
  return thursday.getTime()
}

// A team's Jira rows are "sprint rows" when every one carries sprint metadata
// (the new ingest format). A legacy file (isoWeek-keyed, no `sprint`) returns
// false so callers can fall back to the old calendar-week join.
export function hasSprintRows(jiraRows) {
  return jiraRows.length > 0 && jiraRows.every((r) => r && r.sprint)
}

// Merge per-sprint Jira rows with weekly calendar rows into sprint-aligned rows.
//   jiraRows:     [{ sprint: { id, name, state, startDate, endDate }, jira: {...} }]
//   calendarRows: [{ isoWeek, calendar: { avgMeetingHoursPerWeek, ... } }]
// Returns rows ordered by sprint start:
//   [{ week, period: { kind:'sprint', name, state, startDate, endDate }, jira,
//      calendar, hasCalendar }]
// `calendar` is null when no calendar week falls in the sprint window (the
// caller substitutes its own placeholder and marks the source accordingly).
export function buildSprintRows(jiraRows, calendarRows) {
  const sprints = [...jiraRows].sort(
    (a, b) => sprintStartMs(a.sprint) - sprintStartMs(b.sprint)
  )
  return sprints.map((row, i) => {
    const startMs = sprintStartMs(row.sprint)
    const endMs = sprintEndMs(row.sprint)
    const inWindow = calendarRows.filter((c) => {
      const t = isoWeekThursdayMs(c.isoWeek)
      return Number.isFinite(t) && t >= startMs && t <= endMs
    })
    const calendar = inWindow.length
      ? {
          avgMeetingHoursPerWeek:
            Math.round(
              (inWindow.reduce(
                (sum, c) => sum + (c.calendar?.avgMeetingHoursPerWeek ?? 0),
                0
              ) /
                inWindow.length) *
                10
            ) / 10,
        }
      : null
    return {
      week: i + 1,
      period: {
        kind: 'sprint',
        name: row.sprint.name,
        state: row.sprint.state,
        startDate: row.sprint.startDate,
        endDate: row.sprint.endDate,
      },
      jira: row.jira,
      calendar,
      hasCalendar: inWindow.length > 0,
    }
  })
}

function sprintStartMs(sprint) {
  const t = Date.parse(sprint?.startDate ?? '')
  return Number.isFinite(t) ? t : 0
}

// Active sprints may not have an end date yet — treat as open-ended so their
// in-flight weeks still fold in.
function sprintEndMs(sprint) {
  const t = Date.parse(sprint?.endDate ?? '')
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}
