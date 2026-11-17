// "Not enough data" rule tests (Sprint 8 gap): a week whose counted signals
// carry less than 40% of the score's weight shows no score and gets no
// coaching note. Display and coaching only: computeHealthScore, the weights,
// the thresholds and the early-warning rule are unchanged.
//
// Run: node --no-warnings scripts/test-coverage.mjs

import fs from 'node:fs'
import { build } from 'esbuild'
import { ROOT, devEnv, call, addLiveTeam, makeSuite, assert } from './lib/api-harness.mjs'

const bundle = async (contents, loader) => {
  const out = await build({ stdin: { contents, resolveDir: ROOT, loader }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)
}
const client = await bundle(`export { computeDataCoverage, MIN_COVERAGE, computeHealthScore } from './src/logic/healthScore'`, 'js')
const server = await bundle(`export { computeDataCoverage, MIN_COVERAGE, computeHealthScore } from './functions/api/_lib/scoring'`, 'ts')

const STATES = ['live', 'demo', 'placeholder', undefined]
const suite = makeSuite('Data coverage and "Not enough data" (40% rule)')

await suite.test('client and server agree on coverage for every source combination', async () => {
  let n = 0
  for (const jira of STATES) for (const github of STATES) for (const calendar of STATES) {
    const s = { jira, github, calendar }
    assert(client.computeDataCoverage(s) === server.computeDataCoverage(s), JSON.stringify(s)); n++
  }
  assert(client.MIN_COVERAGE === 0.4 && server.MIN_COVERAGE === 0.4, 'threshold')
  return `${n} combinations`
})
await suite.test('coverage values: all signals 1.0, live team today 0.6, Jira only 0.4, calendar only 0.2, none 0', async () => {
  const c = client.computeDataCoverage
  const got = [
    c({ jira: 'live', github: 'live', calendar: 'live' }),
    c({ jira: 'live', github: 'placeholder', calendar: 'live' }),
    c({ jira: 'live', github: 'placeholder', calendar: 'placeholder' }),
    c({ jira: 'placeholder', github: 'placeholder', calendar: 'live' }),
    c({ jira: 'placeholder', github: 'placeholder', calendar: 'placeholder' }),
  ]
  assert(JSON.stringify(got) === JSON.stringify([1, 0.6, 0.4, 0.2, 0]), got.join(','))
  return got.join(', ')
})
await suite.test('the score itself is unchanged by this rule', async () => {
  const w = { jira: { avgCycleTimeDays: 3, sprintCompletionPct: 70 }, github: { avgReviewTurnaroundHours: 12, pctCommitsAfter7pm: 15 }, calendar: { avgMeetingHoursPerWeek: 8 } }
  for (const jira of STATES) for (const calendar of STATES) {
    const s = { jira, github: 'placeholder', calendar }
    assert(client.computeHealthScore(w, s) === server.computeHealthScore(w, s), JSON.stringify(s))
  }
})

// End to end through the API: a live team whose third week is an empty sprint.
const HEALTHY = [[30, 2.6, 88, 5], [31, 2.5, 90, 5], [0, 0, 0, 5], [34, 2.5, 91, 5]]
await suite.test('empty sprint (0 issues, 0-day cycle time): Jira marked missing, not a perfect cycle time', async () => {
  const { sqlite, env } = devEnv(); addLiveTeam(sqlite, 'empty', 'Empty', HEALTHY)
  const r = await call(env, 'GET', '/api/teams/empty/signals')
  const w = r.json.weeks[2]
  assert(w.sources.jira === 'placeholder', `jira source ${w.sources.jira}`)
  assert(client.computeDataCoverage(w.sources) < client.MIN_COVERAGE, `coverage ${client.computeDataCoverage(w.sources)}`)
  return `week 3 coverage ${client.computeDataCoverage(w.sources)} -> "Not enough data"`
})
await suite.test('empty sprint week: coaching refused with 422 not_enough_data, model never called', async () => {
  const { sqlite, env } = devEnv(); const log = []; env.AI = { run: async () => { log.push(1); return { response: 'x' } } }
  addLiveTeam(sqlite, 'empty', 'Empty', HEALTHY)
  const r = await call(env, 'POST', '/api/insight', { body: { teamId: 'empty', week: 3 } })
  assert(r.status === 422 && r.json.error === 'not_enough_data' && log.length === 0, `HTTP ${r.status} ${r.text} calls ${log.length}`)
})
await suite.test('a normal week of the same team still gets a note', async () => {
  const { sqlite, env } = devEnv(); addLiveTeam(sqlite, 'empty', 'Empty', HEALTHY)
  const r = await call(env, 'POST', '/api/insight', { body: { teamId: 'empty', week: 4 } })
  assert(r.status === 200 && r.json.status, `HTTP ${r.status}`)
})
await suite.test('UI: "Not enough data" text and live regions are present', async () => {
  const hud = fs.readFileSync(`${ROOT}src/ui/TeamHUD.jsx`, 'utf8')
  const note = fs.readFileSync(`${ROOT}src/ui/CoachingNote.jsx`, 'utf8')
  assert(hud.includes('Not enough data') && note.includes('Not enough data'), 'missing text')
  assert((hud.match(/aria-live="polite"/g) ?? []).length >= 3 && note.includes('aria-live="polite"'), 'missing aria-live')
  assert(hud.includes('aria-label={`Team health score'), 'missing spoken score label')
})
suite.done()
