// Asserts that the server scorer (functions/api/_lib/scoring.ts) and the
// browser scorer (src/logic/healthScore.js) produce identical numbers for the
// same weekly signals. The AI is only ever shown server numbers, so this
// guards against the two copies drifting apart.
//
// Run: node scripts/test-scoring-parity.mjs

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import * as client from '../src/logic/healthScore.js'
import { generateWeeklyRows } from '../src/data/generatedSignals.js'

const serverBundle = await build({
  entryPoints: [fileURLToPath(new URL('../functions/api/_lib/scoring.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const serverUrl = `data:text/javascript;base64,${Buffer.from(serverBundle.outputFiles[0].text).toString('base64')}`
const server = await import(serverUrl)

// Same tuple shape the app uses: [issueCount, cycle, completion, prCount,
// review, afterHours, meetings]. Hand-tuned rows copied from mockSignals.js.
const PLATFORM_ROWS = [
  [30, 3.4, 78, 18, 9.0, 12, 6.0], [31, 3.2, 80, 19, 8.4, 11, 5.8],
  [33, 3.1, 82, 20, 7.8, 10, 5.6], [34, 2.9, 84, 21, 7.2, 10, 5.5],
  [35, 2.8, 86, 22, 6.6, 9, 5.3], [36, 2.7, 88, 24, 6.0, 9, 5.2],
  [37, 2.6, 90, 25, 5.5, 8, 5.0], [38, 2.5, 92, 26, 5.0, 8, 4.8],
]
const BACKEND_ROWS = [
  [29, 3.3, 80, 20, 8.0, 10, 6.0], [30, 3.2, 81, 21, 7.6, 11, 6.3],
  [31, 3.3, 79, 20, 8.0, 10, 6.1], [32, 3.6, 74, 19, 10.0, 14, 8.0],
  [35, 4.2, 66, 17, 13.0, 19, 10.2], [39, 5.0, 58, 15, 17.0, 25, 12.6],
  [43, 5.8, 50, 13, 21.0, 31, 15.1], [47, 6.5, 44, 11, 26.0, 37, 17.5],
]

function toWeeks(rows) {
  return rows.map(([issueCount, cycle, completion, prCount, review, afterHours, meetings], i) => ({
    week: i + 1,
    jira: { issueCount, avgCycleTimeDays: cycle, sprintCompletionPct: completion },
    github: { prCount, avgReviewTurnaroundHours: review, pctCommitsAfter7pm: afterHours },
    calendar: { avgMeetingHoursPerWeek: meetings },
  }))
}

const fixtures = {
  platform: toWeeks(PLATFORM_ROWS),
  backend: toWeeks(BACKEND_ROWS),
  ...Object.fromEntries(
    ['solstice', 'growth-2', 'team-four', 'alpha', 'zeta'].map((id) => [id, toWeeks(generateWeeklyRows(id))])
  ),
}

let failures = 0
for (const [teamId, weeks] of Object.entries(fixtures)) {
  const clientScores = weeks.map((w) => client.computeHealthScore(w))
  const serverScores = weeks.map((w) => server.computeHealthScore(w))
  const clientCap = weeks.map((w) => client.computeCapabilityScore(w))
  const serverCap = weeks.map((w) => server.computeCapabilityScore(w))
  const clientWarn = weeks.map((_, i) => client.isEarlyWarning(clientScores, i))
  const serverWarn = weeks.map((_, i) => server.isEarlyWarning(serverScores, i))

  const same =
    JSON.stringify(clientScores) === JSON.stringify(serverScores) &&
    JSON.stringify(clientCap) === JSON.stringify(serverCap) &&
    JSON.stringify(clientWarn) === JSON.stringify(serverWarn)

  if (!same) {
    failures++
    console.log(`FAIL ${teamId}`)
    console.log('  client score', clientScores)
    console.log('  server score', serverScores)
  } else {
    console.log(`PASS ${teamId}  scores ${serverScores.join(',')}`)
  }
}

console.log(failures === 0 ? '\nParity OK: server and browser scorers agree.' : `\n${failures} team(s) differ`)
process.exit(failures ? 1 : 0)
