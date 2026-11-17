// Exports matched, seeded scenario sets for E5 (blinded within-subject session:
// baseline vs AI-enhanced, same scenarios for both variants, counterbalanced).
//
// Each set has 5 teams: 2 real strain episodes, 1 benign confounder (should NOT
// be called at-risk), 1 typical healthy team and 1 healthy team that is BETTER
// than its cohort (the Opower "boomerang" check: does anyone suggest relaxing?).
// Set A and Set B have the same structure with different seeds/families so a
// manager sees one set per variant with no repeated team.
//
// Rows use the app's own row format - [issueCount, avgCycleTimeDays,
// sprintCompletionPct, prCount, avgReviewTurnaroundHours, pctCommitsAfter7pm,
// avgMeetingHoursPerWeek] - the same shape as PLATFORM_ROWS in
// src/data/mockSignals.js, so a set can be loaded as hand-tuned scenario teams
// for the sessions. The answer key is written to a SEPARATE file; participants'
// materials must never include it.
//
// Run: node scripts/validation/export-e5-scenarios.mjs

import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { generateTeam } from './simulate.mjs'
import { LIBRARY } from './scenarios.mjs'

const OUT_DIR = fileURLToPath(new URL('../../eval/validation/', import.meta.url))
const E5_SEED = 20_000_000
const WINDOW = 8
const ONSET_INDEX = 3 // the episode starts at the 4th displayed week

const held = (id, severity = '-') => LIBRARY.heldout.find((s) => s.id === id && s.severity === severity)
const nullSpec = (baseline) => ({ kind: 'null', id: 'healthy', severity: '-', duration: 0, effects: {}, baseline })
const TYPICAL = undefined
const BEST = { cycleTime: 2.4, completion: 90, reviewTurnaround: 5, afterHours: 5, meeting: 4.5 }

const SETS = {
  A: [
    { spec: held('key_person_departure', 'clear'), truth: 'at-risk' },
    { spec: held('meeting_surge', 'clear'), truth: 'at-risk' },
    { spec: held('planned_hardening_sprint'), truth: 'benign (planned, not at-risk)' },
    { spec: nullSpec(TYPICAL), truth: 'healthy (typical)' },
    { spec: nullSpec(BEST), truth: 'healthy (better than cohort)' },
  ],
  B: [
    { spec: held('slow_burnout', 'clear'), truth: 'at-risk' },
    { spec: held('knowledge_concentration', 'clear'), truth: 'at-risk' },
    { spec: held('holiday_week'), truth: 'benign (holiday, not at-risk)' },
    { spec: nullSpec(TYPICAL), truth: 'healthy (typical)' },
    { spec: nullSpec(BEST), truth: 'healthy (better than cohort)' },
  ],
}

const sets = {}
const key = []
let n = 0
for (const [setId, items] of Object.entries(SETS)) {
  sets[setId] = items.map((item, i) => {
    n++
    const seed = E5_SEED + n * 101
    const team = generateTeam(item.spec, seed, 1)
    const start = team.onset != null ? team.onset - ONSET_INDEX : 10 + (seed % 15)
    const label = `Team ${setId}${i + 1}`
    const w = team.weeks.slice(start, start + WINDOW)
    const issues = 26 + (seed % 9)
    const prs = 15 + (seed % 7)
    key.push({
      set: setId,
      team: label,
      truth: item.truth,
      scenario: item.spec.id,
      severity: item.spec.severity,
      seed,
      eventStartsAtDisplayedWeek: team.onset != null ? ONSET_INDEX + 1 : null,
    })
    return {
      team: label,
      rows: w.map((x) => [
        issues,
        x.jira.avgCycleTimeDays,
        x.jira.sprintCompletionPct,
        prs,
        x.github.avgReviewTurnaroundHours,
        x.github.pctCommitsAfter7pm,
        x.calendar.avgMeetingHoursPerWeek,
      ]),
    }
  })
}

await mkdir(OUT_DIR, { recursive: true })
await writeFile(
  `${OUT_DIR}e5_scenarios.json`,
  JSON.stringify(
    {
      readme:
        'Participant-safe: no answer key. Row = [issueCount, avgCycleTimeDays, sprintCompletionPct, prCount, avgReviewTurnaroundHours, pctCommitsAfter7pm, avgMeetingHoursPerWeek], 8 weeks per team. Show Set A under one variant and Set B under the other; counterbalance which variant gets which set.',
      sets,
    },
    null,
    2
  ) + '\n'
)
await writeFile(`${OUT_DIR}e5_answer_key.json`, JSON.stringify(key, null, 2) + '\n')
console.log(`Wrote e5_scenarios.json (${Object.values(sets).flat().length} teams) and e5_answer_key.json (do NOT share the key with participants)`)
console.table(key.map((k) => ({ team: k.team, truth: k.truth, scenario: k.scenario, severity: k.severity })))
