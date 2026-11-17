// IT-02 / IT-03 tests: the early-warning text must describe the rule result
// for THIS week, and the HUD must never carry a fixed warning sentence.
//
// The explanation module is bundled with esbuild (it uses the app's
// extensionless imports). The rule itself (isEarlyWarning) is not changed.
//
// Run: node --no-warnings scripts/test-early-warning-text.mjs

import fs from 'node:fs'
import { build } from 'esbuild'
import { ROOT, makeSuite, assert } from './lib/api-harness.mjs'

const out = await build({
  stdin: {
    contents: `
      export { explainWeek, EARLY_WARNING_RATIO } from './src/logic/earlyWarningExplain'
      export { isEarlyWarning, computeHealthScore } from './src/logic/healthScore'
      export { getWeeklySignalsForTeam } from './src/data/mockSignals'
    `,
    resolveDir: ROOT, loader: 'js',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', loader: { '.json': 'json' },
})
const m = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)

// A week of signals; `bad` (0..1) worsens cycle time, completion and meeting load together.
const week = (bad = 0, sources = { jira: 'live', github: 'placeholder', calendar: 'live' }) => {
  const signals = {
    jira: { issueCount: 20, avgCycleTimeDays: 2 + 4 * bad, sprintCompletionPct: 90 - 50 * bad },
    github: { prCount: 0, avgReviewTurnaroundHours: 12, pctCommitsAfter7pm: 15 },
    calendar: { avgMeetingHoursPerWeek: 6 + 8 * bad },
  }
  return { signals, sources, score: m.computeHealthScore(signals, sources) }
}
const series = (bads) => bads.map((b) => week(b))
const suite = makeSuite('Early-warning text follows the rule result (IT-02, IT-03)')

await suite.test('improving history: no warning text in any week', async () => {
  const rows = series([0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0, 0])
  for (let i = 0; i < rows.length; i++) { const e = m.explainWeek(rows, i); assert(!e.flagged && e.headline === null, `week ${i + 1} flagged`) }
  return `scores ${rows.map((r) => r.score).join(',')}`
})
await suite.test('steady history: no warning text, baseline line says no early warning', async () => {
  const rows = series([0.2, 0.2, 0.2, 0.2, 0.2])
  const e = m.explainWeek(rows, 4)
  assert(!e.flagged && e.headline === null && /no early warning/.test(e.baselineLine), e.baselineLine)
  return e.baselineLine
})
await suite.test('declining history: warning names threshold, average and the signals that dropped', async () => {
  const rows = series([0.1, 0.1, 0.1, 0.8])
  const e = m.explainWeek(rows, 3)
  assert(e.flagged, `not flagged: ${e.baselineLine}`)
  assert(e.headline.includes(`threshold of ${e.threshold}`) && e.headline.includes(`average, ${e.baseline}`), e.headline)
  assert(e.drivers.length > 0 && e.drivers.every((d) => ['cycle time', 'sprint completion', 'meeting load'].includes(d.label)), JSON.stringify(e.drivers))
  return e.headline
})
await suite.test('placeholder GitHub signals are never named as a driver', async () => {
  const rows = series([0, 0, 0, 0.9])
  rows[3].signals.github = { prCount: 0, avgReviewTurnaroundHours: 99, pctCommitsAfter7pm: 90 }
  const e = m.explainWeek(rows, 3)
  assert(!e.drivers.some((d) => /review|after-hours/.test(d.label)), JSON.stringify(e.drivers))
})
await suite.test('first 3 weeks: no baseline yet, says so', async () => {
  const rows = series([0, 0.9, 0.9])
  for (let i = 0; i < 3; i++) { const e = m.explainWeek(rows, i); assert(!e.hasBaseline && !e.flagged && /starts after 3 weeks/.test(e.baselineLine), e.baselineLine) }
})
await suite.test('explanation flag always equals the production rule (2,000 random series)', async () => {
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  for (let n = 0; n < 2000; n++) {
    const rows = series(Array.from({ length: 6 }, () => rand()))
    const scores = rows.map((r) => r.score)
    for (let i = 0; i < rows.length; i++) {
      const e = m.explainWeek(rows, i)
      assert(e.flagged === m.isEarlyWarning(scores, i), `mismatch at ${scores} week ${i}`)
      if (e.hasBaseline) assert((e.score < e.threshold) === e.flagged, `threshold ${e.threshold} inconsistent with flag for ${scores} week ${i}`)
    }
  }
  return '12,000 team-weeks'
})
await suite.test('shown ratio matches the rule (score 85 vs average 100 not flagged, 84 flagged)', async () => {
  assert(m.EARLY_WARNING_RATIO === 0.85, 'ratio')
  assert(!m.isEarlyWarning([100, 100, 100, 85], 3) && m.isEarlyWarning([100, 100, 100, 84], 3), 'rule changed')
})
await suite.test('IT-02 case: Platform Team week 8 (improving) shows no warning', async () => {
  const weeks = m.getWeeklySignalsForTeam('platform')
  const rows = weeks.map((w) => ({ signals: w, sources: w.sources, score: m.computeHealthScore(w, w.sources) }))
  const e = m.explainWeek(rows, rows.length - 1)
  assert(!e.flagged && e.headline === null, e.headline ?? '')
  return `score ${e.score}, ${e.baselineLine}`
})
await suite.test('no fixed warning sentence left in the UI', async () => {
  for (const f of ['src/ui/TeamHUD.jsx', 'src/ui/CompareView.jsx']) {
    const src = fs.readFileSync(`${ROOT}${f}`, 'utf8')
    assert(!/rising cycle time and workload/.test(src), `${f} still has the fixed text`)
  }
})

suite.done()
