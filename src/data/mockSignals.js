// Mock signal data for two teams across 8 consecutive weeks.
//
// This is deliberately hand-tuned (not `Math.random()`) so the narrative is
// guaranteed and reviewable: "Platform Team" trends stable/improving the
// whole time, "Backend Team" looks fine through week 3 and then visibly
// slides — rising cycle time, dropping sprint completion, slower PR
// reviews, and more after-hours commits — while its meeting load climbs
// alongside the decline (the "why" behind the strain).
//
// Swap this file for a real Jira/GitHub/Calendar integration later; nothing
// downstream should care how these arrays were produced, only that each
// team has one row of signals per week.

// [issueCount, avgCycleTimeDays, sprintCompletionPct, prCount,
//  avgReviewTurnaroundHours, pctCommitsAfter7pm, avgMeetingHoursPerWeek]
const PLATFORM_ROWS = [
  [30, 3.4, 78, 18, 9.0, 12, 6.0],
  [31, 3.2, 80, 19, 8.4, 11, 5.8],
  [33, 3.1, 82, 20, 7.8, 10, 5.6],
  [34, 2.9, 84, 21, 7.2, 10, 5.5],
  [35, 2.8, 86, 22, 6.6, 9, 5.3],
  [36, 2.7, 88, 24, 6.0, 9, 5.2],
  [37, 2.6, 90, 25, 5.5, 8, 5.0],
  [38, 2.5, 92, 26, 5.0, 8, 4.8],
]

const BACKEND_ROWS = [
  [29, 3.3, 80, 20, 8.0, 10, 6.0],
  [30, 3.2, 81, 21, 7.6, 11, 6.3],
  [31, 3.3, 79, 20, 8.0, 10, 6.1],
  // decline begins around week 4 ...
  [32, 3.6, 74, 19, 10.0, 14, 8.0],
  [35, 4.2, 66, 17, 13.0, 19, 10.2],
  [39, 5.0, 58, 15, 17.0, 25, 12.6],
  [43, 5.8, 50, 13, 21.0, 31, 15.1],
  [47, 6.5, 44, 11, 26.0, 37, 17.5],
]

function buildWeeks(rows) {
  return rows.map((row, i) => {
    const [
      issueCount,
      avgCycleTimeDays,
      sprintCompletionPct,
      prCount,
      avgReviewTurnaroundHours,
      pctCommitsAfter7pm,
      avgMeetingHoursPerWeek,
    ] = row
    return {
      week: i + 1,
      jira: { issueCount, avgCycleTimeDays, sprintCompletionPct },
      github: { prCount, avgReviewTurnaroundHours, pctCommitsAfter7pm },
      calendar: { avgMeetingHoursPerWeek },
    }
  })
}

export const WEEK_COUNT = 8

export const WEEKLY_SIGNALS = {
  platform: buildWeeks(PLATFORM_ROWS),
  backend: buildWeeks(BACKEND_ROWS),
}
