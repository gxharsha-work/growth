// Unit checks for the P0-3 layer: code computes the ranking and comparisons,
// the model only writes wording, and anything it cites is validated. Includes
// the exact failures report/week5_report.md flagged (reversed comparison,
// invented number, off-limits wording) plus the fallback-to-template path.
//
// Run: node scripts/test-facts-validate.mjs

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const libDir = fileURLToPath(new URL('../functions/api/_lib/', import.meta.url))
const bundle = await build({
  stdin: {
    contents: `
      export { computeFacts, signalSentence } from './facts'
      export { templateNote } from './template'
      export { validateModelWording } from './validate'
      export { generateCoachingNote } from './coaching'
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

let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`)
  if (!ok) failures++
}

const GOOD = { avgCycleTimeDays: 2.5, sprintCompletionPct: 85, avgReviewTurnaroundHours: 6, pctCommitsAfter7pm: 8, avgMeetingHoursPerWeek: 5 }

// Review turnaround collapses week-over-week; everything else roughly steady.
const evidence = {
  team: { name: 'Backend Team', cohort: { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' } },
  week: 5,
  score: 45,
  trend: -36,
  earlyWarning: true,
  prevSignals: GOOD,
  signals: { ...GOOD, avgReviewTurnaroundHours: 21 },
  peer: { name: 'Peer team A', score: 88, signals: { ...GOOD, avgCycleTimeDays: 2.5, avgReviewTurnaroundHours: 8 } },
}

// --- ranking: code picks the real top signal, not the model ---
const facts = m.computeFacts(evidence)
check('top signal is the biggest mover (review turnaround)', facts.top.id === 'reviewTurnaround', `got ${facts.top.id}`)

// --- comparison direction computed from the numbers (report's reversed case) ---
// Team cycle time 6.5d vs peer 2.5d must read "higher", never "lower".
const cycleEvidence = {
  ...evidence,
  signals: { ...GOOD, avgCycleTimeDays: 6.5, avgReviewTurnaroundHours: 6 },
  prevSignals: { ...GOOD, avgCycleTimeDays: 2.5 },
  peer: { name: 'Peer team A', score: 88, signals: { ...GOOD, avgCycleTimeDays: 2.5 } },
}
const cycleFacts = m.computeFacts(cycleEvidence)
const sentence = m.signalSentence(cycleFacts)
check('cycle-time sentence says higher than peer', /higher than Peer team A's 2\.5d/.test(sentence), sentence)
check('cycle-time sentence never says lower', !/lower/.test(sentence), sentence)

// --- validation ---
check('valid wording passes', m.validateModelWording({ status: 'Worth investigating', action: 'Spread review load across the team.' }, facts).ok)
check('invented number rejected', !m.validateModelWording({ status: 'Worth investigating', action: 'Cut cycle time to 3.2 days.' }, facts).ok)
check('evidence number allowed', m.validateModelWording({ status: 'Worth investigating', action: 'Work the score back above 45.' }, facts).ok)
check('burnout wording rejected', !m.validateModelWording({ status: 'Burnout risk rising', action: 'Check in with the team.' }, facts).ok)
check('attrition wording rejected', !m.validateModelWording({ status: 'Worth investigating', action: 'Address attrition risk now.' }, facts).ok)
check('empty action rejected', !m.validateModelWording({ status: 'Worth investigating', action: '' }, facts).ok)

// --- generateCoachingNote end to end with a mock AI ---
const run = (response) => ({ run: async () => ({ response }) })

let note = await m.generateCoachingNote(run('STATUS: Worth investigating\nACTION: Spread review load across the team.'), evidence)
check('valid model output -> source model', note.source === 'model', note.source)
check('signal line is code-generated (review turnaround)', note.signal.includes('Review turnaround'), note.signal)

note = await m.generateCoachingNote(run('STATUS: Burnout risk\nACTION: Talk to people.'), evidence)
check('off-limits output -> template fallback', note.source === 'template', note.source)

note = await m.generateCoachingNote(run('STATUS: Fix it\nACTION: Get cycle time to 3.2 days.'), evidence)
check('invented-number output -> template fallback', note.source === 'template', note.source)

note = await m.generateCoachingNote({ run: async () => { throw new Error('AI down') } }, evidence)
check('AI failure -> template fallback (no throw)', note.source === 'template', note.source)
check('fallback still has a grounded signal line', note.signal.includes('Review turnaround'), note.signal)

// Even if the model names a different signal in its wording, the SIGNAL line
// stays the code-chosen one (the model can no longer pick the signal).
note = await m.generateCoachingNote(run('STATUS: Worth investigating\nACTION: Look at sprint completion.'), evidence)
check('signal stays code-chosen regardless of model wording', note.signal.includes('Review turnaround'), note.signal)

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
process.exit(failures ? 1 : 0)
