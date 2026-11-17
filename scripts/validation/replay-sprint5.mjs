// Replays the REAL live-model outputs recorded in Sprint 5 (eval/results.csv, config C: 16 real
// Platform/Backend team-weeks x 5 runs) through a coaching pipeline and reports what the USER would
// have been shown. Running it against the pre-change tree and the current tree gives a before/after
// on real model behaviour without calling the model again.
//
// What this tests: the code AROUND the model (status derivation, healthy-week bypass, validator).
// What it cannot test: the new one-line ACTION prompt - the recorded outputs came from the older
// STATUS/SIGNAL/ACTION prompt, so the replay feeds them back as-is (the new pipeline reads only the
// ACTION line). Re-running scripts/evaluate-coaching.mjs against a deployed endpoint measures the prompt.
//
// Run: node scripts/validation/replay-sprint5.mjs [--lib=<a functions/api/_lib dir>] [--out=<file under eval/validation/>]

import fs from 'node:fs'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { computeHealthScore, isEarlyWarning } from '../../src/logic/healthScore.js'

const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const libDir = argv.lib ? argv.lib.replace(/\/?$/, '/') : `${ROOT}functions/api/_lib/`

const bundle = await build({
  stdin: { contents: "export { generateCoachingNote } from './coaching'", resolveDir: libDir, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
})
const m = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

// --- the hand-tuned Platform/Backend rows (mockSignals.js uses Vite-style imports Node cannot resolve) ---
const src = fs.readFileSync(`${ROOT}src/data/mockSignals.js`, 'utf8')
const grab = (name) => new Function(`return ${new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\])`).exec(src)[1]}`)()
const toSignals = ([, cyc, comp, , rev, aft, meet]) => ({
  avgCycleTimeDays: cyc, sprintCompletionPct: comp, avgReviewTurnaroundHours: rev, pctCommitsAfter7pm: aft, avgMeetingHoursPerWeek: meet,
})
const toWeek = (r) => ({ jira: { avgCycleTimeDays: r[1], sprintCompletionPct: r[2] }, github: { avgReviewTurnaroundHours: r[4], pctCommitsAfter7pm: r[5] }, calendar: { avgMeetingHoursPerWeek: r[6] } })
const TEAMS = {
  platform: { name: 'Platform Team', rows: grab('PLATFORM_ROWS') },
  backend: { name: 'Backend Team', rows: grab('BACKEND_ROWS') },
}
for (const t of Object.values(TEAMS)) t.scores = t.rows.map((r) => computeHealthScore(toWeek(r)))
const other = { platform: 'backend', backend: 'platform' }

function evidenceFor(caseId) {
  const [team, wk] = [caseId.split('-w')[0], Number(caseId.split('-w')[1])]
  const t = TEAMS[team], p = TEAMS[other[team]]
  const i = wk - 1
  return {
    team: { name: t.name, cohort: { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' } },
    week: wk,
    score: t.scores[i],
    trend: i > 0 ? t.scores[i] - t.scores[i - 1] : 0,
    earlyWarning: isEarlyWarning(t.scores, i),
    signals: toSignals(t.rows[i]),
    prevSignals: i > 0 ? toSignals(t.rows[i - 1]) : null,
    peer: { name: 'Peer team A', score: p.scores[i], signals: toSignals(p.rows[i]) },
  }
}

// --- minimal RFC4180 CSV parser ---
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}
const [hdr, ...body] = parseCsv(fs.readFileSync(`${ROOT}eval/results.csv`, 'utf8'))
const ix = Object.fromEntries(hdr.map((h, i) => [h, i]))
const recorded = body.filter((r) => r[ix.config] === 'C' && r[ix.case_type] === 'real')

let modelCalls = 0
const results = []
for (const r of recorded) {
  const ev = evidenceFor(r[ix.case_id])
  const raw = r[ix.raw_output].split(' | ').join('\n') // the CSV joined the model's lines with " | "
  const ai = { run: async () => { modelCalls++; return { response: raw } } }
  const note = await m.generateCoachingNote(ai, ev)
  results.push({ baseline: r[ix.baseline_status], status: note.status, source: note.source, action: note.action })
}

const healthy = results.filter((x) => x.baseline === 'healthy')
const warning = results.filter((x) => x.baseline === 'warning')
const isConcern = (s) => !/healthy/i.test(s)
const falseConcern = healthy.filter((x) => isConcern(x.status)).length
const missed = warning.filter((x) => !isConcern(x.status)).length
const agree = results.filter((x) => (x.baseline === 'healthy') === !isConcern(x.status)).length
const fromModel = results.filter((x) => x.source === 'model').length
const pc = (k, n) => `${((100 * k) / n).toFixed(1)}% (${k}/${n})`

const lines = [
  `# Replay of real Sprint 5 model outputs through the coaching pipeline`,
  '',
  `Code under test: \`${libDir.replace(ROOT, '')}\`. Input: ${recorded.length} recorded live-model notes (Sprint 5, config C, 16 real team-weeks x 5 runs).`,
  '',
  '| Measure (what the user would have been shown) | Result |',
  '| --- | --- |',
  `| Healthy weeks shown as a concern (false concern) | ${pc(falseConcern, healthy.length)} |`,
  `| Early-warning weeks shown as healthy (false reassurance) | ${pc(missed, warning.length)} |`,
  `| Status agrees with the deterministic flag | ${pc(agree, results.length)} |`,
  `| Notes whose wording came from the model | ${pc(fromModel, results.length)} |`,
  `| Model calls made | ${modelCalls} of ${recorded.length} |`,
  '',
]
fs.mkdirSync(`${ROOT}eval/validation/`, { recursive: true })
fs.writeFileSync(`${ROOT}eval/validation/${argv.out ?? 'replay_sprint5.md'}`, lines.join('\n'))
console.log(lines.join('\n'))
