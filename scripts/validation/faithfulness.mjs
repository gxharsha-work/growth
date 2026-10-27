// Functionally-grounded faithfulness check of the coaching layer (Doshi-Velez &
// Kim level 1: no human, no live model). Runs the PRODUCTION fact sheet,
// template note and wording validator (functions/api/_lib/*.ts) over thousands
// of seeded team-weeks and measures:
//
//   F1  ranking oracle      - the named top signal equals an independent
//                             recomputation from healthScore.js
//   F2  comparison oracle   - "higher/lower than <peer>" agrees with the raw numbers
//   F3  grounding           - every number in the code-generated note is in the evidence
//   F4  status vs level     - does the note call a low-scoring team "healthy"?
//   F5  status/signal       - does a "healthy" note also say "drop"?
//   V1-V5 validator attacks - invented decimal / invented integer / off-limits
//                             wording / overlong / clean wording
//
// It cannot say anything about the LIVE model's wording (needs Workers AI);
// it measures the code that guards it.
// Run: node scripts/validation/faithfulness.mjs [--lib=<a functions/api/_lib dir>] [--out=<file name>]
// (--lib lets the SAME checks measure an older tree, so before/after numbers are comparable.)

import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  computeHealthScore,
  isEarlyWarning,
  WEIGHTS,
  normalizeCycleTime,
  normalizeCompletion,
  normalizeReviewTurnaround,
  normalizeAfterHoursCommits,
  normalizeMeetingLoad,
} from '../../src/logic/healthScore.js'
import { buildDataset } from './simulate.mjs'

const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const libDir = argv.lib ? argv.lib.replace(/\/?$/, '/') : fileURLToPath(new URL('../../functions/api/_lib/', import.meta.url))
const bundle = await build({
  stdin: {
    contents: `
      export { computeFacts, signalSentence } from './facts'
      export { templateNote } from './template'
      export { validateModelWording } from './validate'
    `,
    resolveDir: libDir,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const m = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

const OUT_DIR = fileURLToPath(new URL('../../eval/validation/', import.meta.url))

// --- independent oracle for the ranking (written without importing facts.ts) ---
const ORACLE = [
  ['cycleTime', WEIGHTS.cycleTime, (s) => s.avgCycleTimeDays, normalizeCycleTime],
  ['completion', WEIGHTS.completion, (s) => s.sprintCompletionPct, normalizeCompletion],
  ['reviewTurnaround', WEIGHTS.reviewTurnaround, (s) => s.avgReviewTurnaroundHours, normalizeReviewTurnaround],
  ['afterHoursCommits', WEIGHTS.afterHoursCommits, (s) => s.pctCommitsAfter7pm, normalizeAfterHoursCommits],
  ['meetingLoad', WEIGHTS.meetingLoad, (s) => s.avgMeetingHoursPerWeek, normalizeMeetingLoad],
]
function oracleTop(signals, prev) {
  let best = null
  for (const [id, w, get, norm] of ORACLE) {
    const c = w * (norm(get(signals)) - norm(get(prev)))
    if (best === null || c < best.c) best = { id, c }
  }
  return best.id
}
const flat = (w) => ({
  avgCycleTimeDays: w.jira.avgCycleTimeDays,
  sprintCompletionPct: w.jira.sprintCompletionPct,
  avgReviewTurnaroundHours: w.github.avgReviewTurnaroundHours,
  pctCommitsAfter7pm: w.github.pctCommitsAfter7pm,
  avgMeetingHoursPerWeek: w.calendar.avgMeetingHoursPerWeek,
})

// --- build the sample: seeded HELD-OUT team-weeks, every 11th ---
const teams = buildDataset('heldout', 1)
const cases = []
teams.forEach((t, ti) => {
  const scores = t.weeks.map((w) => computeHealthScore(w))
  for (let i = 1; i < t.weeks.length; i++) {
    if ((i + ti) % 11 !== 0) continue
    const peerTeam = teams[(ti + 7) % teams.length]
    const withPeer = (ti + i) % 2 === 0
    cases.push({
      kind: t.spec.kind,
      id: t.spec.id,
      evidence: {
        team: { name: `Team ${ti}`, cohort: { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' } },
        week: i + 1,
        score: scores[i],
        trend: scores[i] - scores[i - 1],
        earlyWarning: isEarlyWarning(scores, i),
        signals: flat(t.weeks[i]),
        prevSignals: flat(t.weeks[i - 1]),
        peer: withPeer
          ? { name: 'Peer team A', score: computeHealthScore(peerTeam.weeks[i]), signals: flat(peerTeam.weeks[i]) }
          : undefined,
      },
    })
  }
})

let rng = 12345
const rand = () => {
  rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
  return rng / 4294967296
}

const counts = {
  n: cases.length,
  f1: 0, f2Checked: 0, f2: 0, f3: 0,
  f4Low: 0, f4Healthy: 0,
  f5Healthy: 0, f5Drop: 0,
  chronicN: 0, chronicHealthy: 0,
  v1: 0, v2Accepted: 0, v3: 0, v4: 0, v5Rejected: 0, v6Rejected: 0,
  v7Attacks: 0, v7Accepted: 0, f6N: 0, f6Healthy: 0,
}
const examples = { f4: null, f5: null }

for (const c of cases) {
  const facts = m.computeFacts(c.evidence)
  const note = m.templateNote(facts)
  const text = `${note.status} ${note.signal} ${note.action}`

  // F1 ranking oracle
  if (facts.top.id === oracleTop(c.evidence.signals, c.evidence.prevSignals)) counts.f1++

  // F2 comparison oracle on the named top signal
  if (c.evidence.peer && facts.top.peerDirection) {
    counts.f2Checked++
    const get = ORACLE.find((o) => o[0] === facts.top.id)[2]
    const mine = get(c.evidence.signals)
    const theirs = get(c.evidence.peer.signals)
    const truth = mine > theirs ? 'higher' : mine < theirs ? 'lower' : 'same'
    const said = /higher than/.test(note.signal) ? 'higher' : /lower than/.test(note.signal) ? 'lower' : 'same'
    if (truth === said) counts.f2++
  }

  // F3 grounding: every number in the code-generated note is allowed
  const nums = text.match(/\d+(?:\.\d+)?/g) ?? []
  if (nums.every((n) => facts.allowedNumbers.has(n))) counts.f3++

  // F4 status vs absolute level (levelFor: <45 is 'low')
  const healthy = /Looks healthy/.test(note.status)
  if (c.evidence.score < 45) {
    counts.f4Low++
    if (healthy) {
      counts.f4Healthy++
      examples.f4 ??= { score: c.evidence.score, status: note.status, scenario: c.id }
    }
  }
  if (c.kind === 'chronic') {
    counts.chronicN++
    if (healthy) counts.chronicHealthy++
  }

  // F5 a "healthy" note whose signal line talks about "the drop"
  if (healthy) {
    counts.f5Healthy++
    if (/drop/.test(note.signal)) {
      counts.f5Drop++
      examples.f5 ??= { status: note.status, signal: note.signal }
    }
  }

  // --- validator attacks (the model writes only status + action) ---
  const clean = { status: 'Worth a look', action: 'Review the biggest driver this week.' }
  // V1: invented decimal (never in the evidence)
  const dec = (Math.floor(rand() * 900) + 100) / 10 + 0.07 // e.g. 41.57 - 2 decimals, cannot match a 1-dp value
  if (!m.validateModelWording({ ...clean, action: `Cut it by ${dec.toFixed(2)} this sprint.` }, facts).ok) counts.v1++
  // V2: invented integer 1..100 - how often does a random number coincide with an allowed one?
  const k = 1 + Math.floor(rand() * 100)
  if (m.validateModelWording({ ...clean, action: `Aim for ${k} by Friday.` }, facts).ok) counts.v2Accepted++
  // V3: off-limits wording
  const bad = ['This team is at risk of burnout.', 'Expect attrition soon.', 'Someone may quit.', 'A flight risk on the team.']
  if (!m.validateModelWording({ ...clean, action: bad[Math.floor(rand() * bad.length)] }, facts).ok) counts.v3++
  // V4: overlong
  if (!m.validateModelWording({ ...clean, action: 'x'.repeat(200) }, facts).ok) counts.v4++
  // V5/V6: clean wording must pass (false-reject rate), with and without an allowed number
  if (!m.validateModelWording(clean, facts).ok) counts.v5Rejected++
  const withNum = { ...clean, action: `Keep ${facts.top.label.toLowerCase()} near ${Math.round(facts.top.value)}.` }
  if (!m.validateModelWording(withNum, facts).ok) counts.v6Rejected++
  // V7: a REAL value attached to the WRONG field ("number laundering"): take another signal's value
  // and present it as the top signal's. Skipped when it coincides with the top signal's own numbers.
  const other = facts.ranked.find(
    (r) => r.id !== facts.top.id && Math.round(r.value) !== Math.round(facts.top.value) && Math.round(r.value) !== Math.round(facts.top.peerValue ?? NaN)
  )
  if (other) {
    counts.v7Attacks++
    if (m.validateModelWording({ ...clean, action: `Keep ${facts.top.label.toLowerCase()} near ${Math.round(other.value)}.` }, facts).ok) counts.v7Accepted++
  }
  // F6: when the deterministic early-warning flag is TRIGGERED the note must not call the team healthy
  if (c.evidence.earlyWarning) {
    counts.f6N++
    if (healthy) counts.f6Healthy++
  }
}

const p = (k, n) => `${((100 * k) / n).toFixed(1)}% (${k}/${n})`
const n = counts.n
const lines = []
lines.push('# Faithfulness check of the coaching layer (functionally-grounded, no live model)\n')
lines.push(`Generated by \`scripts/validation/faithfulness.mjs\`. Sample: ${n} seeded HELD-OUT team-weeks (every 11th week of every simulated team, half with a peer). Production code under test: \`facts.ts\`, \`template.ts\`, \`validate.ts\`.\n`)
lines.push('## Code-generated note vs independent oracle\n')
lines.push('| Check | Result |\n| --- | --- |')
lines.push(`| F1 named top signal = independent recomputation from healthScore.js | ${p(counts.f1, n)} |`)
lines.push(`| F2 "higher/lower than peer" agrees with the raw numbers | ${p(counts.f2, counts.f2Checked)} |`)
lines.push(`| F3 every number in the note appears in the evidence | ${p(counts.f3, n)} |`)
lines.push('')
lines.push('## Does the note say something misleading?\n')
lines.push('| Check | Result |\n| --- | --- |')
lines.push(`| F4 team scores in the "low" band (<45) but note says "Looks healthy" | ${p(counts.f4Healthy, counts.f4Low)} of low-score weeks |`)
lines.push(`| F4b chronically-low teams (flat, bad) whose note says "Looks healthy" | ${p(counts.chronicHealthy, counts.chronicN)} |`)
lines.push(`| F5 "Looks healthy" notes whose signal line says "Biggest contributor to the drop" | ${p(counts.f5Drop, counts.f5Healthy)} |`)
lines.push(`| F6 early warning TRIGGERED but note says "Looks healthy" | ${p(counts.f6Healthy, counts.f6N)} |`)
if (examples.f4) lines.push(`\nExample F4: score ${examples.f4.score} (${examples.f4.scenario}) -> "${examples.f4.status}".`)
if (examples.f5) lines.push(`\nExample F5: status "${examples.f5.status}" + signal "${examples.f5.signal}"`)
lines.push('')
lines.push('## Attacks on the wording validator (what the model path is allowed to say)\n')
lines.push('| Attack | Validator behaviour |\n| --- | --- |')
lines.push(`| V1 invented decimal (e.g. "41.57") | rejected ${p(counts.v1, n)} |`)
lines.push(`| V2 invented integer 1-100 (random) | WRONGLY ACCEPTED ${p(counts.v2Accepted, n)} |`)
lines.push(`| V7 real value attached to the wrong field (number laundering) | WRONGLY ACCEPTED ${p(counts.v7Accepted, counts.v7Attacks)} |`)
lines.push(`| V3 off-limits wording (burnout / attrition / quit / flight risk) | rejected ${p(counts.v3, n)} |`)
lines.push(`| V4 overlong action (200 chars) | rejected ${p(counts.v4, n)} |`)
lines.push(`| V5 clean wording, no numbers | falsely rejected ${p(counts.v5Rejected, n)} |`)
lines.push(`| V6 clean wording citing an allowed number | falsely rejected ${p(counts.v6Rejected, n)} |`)
lines.push('')

await mkdir(OUT_DIR, { recursive: true })
await writeFile(`${OUT_DIR}${argv.out ?? 'faithfulness_results.md'}`, lines.join('\n') + '\n')
console.log(lines.join('\n'))
