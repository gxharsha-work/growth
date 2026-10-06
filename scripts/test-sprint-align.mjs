// Unit checks for sprint-boundary alignment (src/data/sprintAlign.js):
// calendar weeks fold into the correct sprint window, averages are right,
// rows come out ordered by sprint start, and a sprint with no calendar weeks
// yields a null calendar. Run: node scripts/test-sprint-align.mjs
import {
  isoWeekThursdayMs,
  hasSprintRows,
  buildSprintRows,
} from '../src/data/sprintAlign.js'

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) {
    pass++
    console.log(`PASS  ${name}`)
  } else {
    fail++
    console.log(`FAIL  ${name}`)
  }
}

// --- isoWeekThursdayMs ---
const w10 = new Date(isoWeekThursdayMs('2026-W10')).toISOString().slice(0, 10)
check('ISO 2026-W10 Thursday is 2026-03-05', w10 === '2026-03-05')
check('malformed iso week -> NaN', Number.isNaN(isoWeekThursdayMs('nope')))

// --- hasSprintRows ---
check('sprint rows detected', hasSprintRows([{ sprint: {}, jira: {} }]))
check('legacy isoWeek rows not detected', !hasSprintRows([{ isoWeek: '2026-W10', jira: {} }]))
check('empty -> false', !hasSprintRows([]))

// --- buildSprintRows ---
const jiraRows = [
  // intentionally out of order to prove sorting
  { sprint: { id: 2, name: 'Sprint 2', state: 'closed', startDate: '2026-03-16', endDate: '2026-03-29' }, jira: { issueCount: 8, avgCycleTimeDays: 5, sprintCompletionPct: 70 } },
  { sprint: { id: 1, name: 'Sprint 1', state: 'closed', startDate: '2026-03-02', endDate: '2026-03-15' }, jira: { issueCount: 6, avgCycleTimeDays: 4, sprintCompletionPct: 83 } },
  { sprint: { id: 3, name: 'Sprint 3', state: 'active', startDate: '2026-03-30', endDate: '2026-04-12' }, jira: { issueCount: 5, avgCycleTimeDays: 3, sprintCompletionPct: 20 } },
]
const calendarRows = [
  { isoWeek: '2026-W10', calendar: { avgMeetingHoursPerWeek: 4 } }, // Thu 03-05 -> Sprint 1
  { isoWeek: '2026-W11', calendar: { avgMeetingHoursPerWeek: 6 } }, // Thu 03-12 -> Sprint 1
  { isoWeek: '2026-W12', calendar: { avgMeetingHoursPerWeek: 10 } }, // Thu 03-19 -> Sprint 2
  { isoWeek: '2026-W13', calendar: { avgMeetingHoursPerWeek: 12 } }, // Thu 03-26 -> Sprint 2
  { isoWeek: '2026-W20', calendar: { avgMeetingHoursPerWeek: 99 } }, // Thu 05-14 -> none
]

const rows = buildSprintRows(jiraRows, calendarRows)

check('rows ordered by sprint start', rows.map((r) => r.period.name).join(',') === 'Sprint 1,Sprint 2,Sprint 3')
check('week index is sequential', rows.map((r) => r.week).join(',') === '1,2,3')
check('jira kept intact per sprint', rows[0].jira.sprintCompletionPct === 83 && rows[1].jira.avgCycleTimeDays === 5)
check('Sprint 1 calendar averages its two weeks (5.0)', rows[0].calendar.avgMeetingHoursPerWeek === 5)
check('Sprint 2 calendar averages its two weeks (11.0)', rows[1].calendar.avgMeetingHoursPerWeek === 11)
check('out-of-window week (W20) excluded', rows.every((r) => (r.calendar?.avgMeetingHoursPerWeek ?? 0) !== 99))
check('active sprint with no calendar weeks -> null calendar', rows[2].calendar === null)
check('hasCalendar flag tracks presence', rows[0].hasCalendar === true && rows[2].hasCalendar === false)
check('period carries sprint boundaries', rows[0].period.startDate === '2026-03-02' && rows[0].period.endDate === '2026-03-15')
check('period carries sprint state', rows[2].period.state === 'active')

console.log(`\n${fail === 0 ? 'ALL PASSED' : fail + ' FAILED'} (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
