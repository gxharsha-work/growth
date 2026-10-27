// Measures the CURRENT coaching pipeline against the REAL Workers AI model (Sprint 8, the open item
// from HANDOFF.md section 4.6). It runs the production generateCoachingNote with its model call
// replaced by a plain HTTPS request to Cloudflare's Workers AI REST API (same model, same messages,
// same temperature, same max_tokens). Nothing is deployed and nothing in the app is changed.
//
// Cases: the 16 real Platform/Backend team-weeks (as in Sprint 5) plus the seeded expert-session
// profiles at weeks 5 and 8. A week whose status is "healthy" must NOT call the model (by design);
// every other week is run RUNS times to see whether the model is consistent.
//
// Needs CLOUDFLARE_API_TOKEN (Workers AI permission) in the environment; never printed.
// Run:  node --env-file=.env scripts/validation/live-model-eval.mjs [--dry] [--runs=3]

import fs from 'node:fs'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { computeHealthScore, isEarlyWarning } from '../../src/logic/healthScore.js'

const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const RUNS = Number(argv.runs ?? 3)
const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8' // must match MODEL in functions/api/_lib/coaching.ts

const bundle = await build({
  stdin: {
    contents: `
      export { generateCoachingNote, parseAction } from './coaching'
      export { computeFacts } from './facts'
      export { validateModelWording, addressesTopSignal, isVagueFiller } from './validate'
      export { templateNote } from './template'`,
    resolveDir: `${ROOT}functions/api/_lib/`, loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
})
const m = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

// ---------- evidence builders ----------
const src = fs.readFileSync(`${ROOT}src/data/mockSignals.js`, 'utf8')
const grab = (name) => new Function(`return ${new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\])`).exec(src)[1]}`)()
const sig = ([, cyc, comp, , rev, aft, meet]) => ({ avgCycleTimeDays: cyc, sprintCompletionPct: comp, avgReviewTurnaroundHours: rev, pctCommitsAfter7pm: aft, avgMeetingHoursPerWeek: meet })
const wk = (r) => ({ jira: { avgCycleTimeDays: r[1], sprintCompletionPct: r[2] }, github: { avgReviewTurnaroundHours: r[4], pctCommitsAfter7pm: r[5] }, calendar: { avgMeetingHoursPerWeek: r[6] } })
const cohort = { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' }

function evidenceFromRows(name, rows, week, peer) {
  const scores = rows.map((r) => computeHealthScore(wk(r)))
  const i = week - 1
  return {
    team: { name, cohort }, week, score: scores[i], trend: i > 0 ? scores[i] - scores[i - 1] : 0,
    earlyWarning: isEarlyWarning(scores, i), signals: sig(rows[i]), prevSignals: i > 0 ? sig(rows[i - 1]) : null,
    peer: peer ? { name: 'Peer team A', score: computeHealthScore(wk(peer[i])), signals: sig(peer[i]) } : undefined,
  }
}
const PLATFORM = grab('PLATFORM_ROWS'), BACKEND = grab('BACKEND_ROWS')
const cases = []
for (let w = 1; w <= 8; w++) {
  cases.push({ id: `platform-w${w}`, kind: 'real', ev: evidenceFromRows('Platform Team', PLATFORM, w, BACKEND) })
  cases.push({ id: `backend-w${w}`, kind: 'real', ev: evidenceFromRows('Backend Team', BACKEND, w, PLATFORM) })
}
const prof = JSON.parse(fs.readFileSync(`${ROOT}eval/validation/e5_scenarios.json`, 'utf8'))
for (const t of Object.values(prof.sets).flat()) for (const w of [5, 8]) cases.push({ id: `${t.team.replace(' ', '-').toLowerCase()}-w${w}`, kind: 'seeded', ev: evidenceFromRows(t.team, t.rows, w) })

for (const c of cases) { const f = m.computeFacts(c.ev); c.facts = f; c.status = f.status }
const needModel = cases.filter((c) => c.status !== 'healthy')
console.log(`cases: ${cases.length} | healthy (model must NOT be called): ${cases.length - needModel.length} | need the model: ${needModel.length} x ${RUNS} runs = ${needModel.length * RUNS} calls`)
if ('dry' in argv) process.exit(0)

// ---------- the real model behind the same interface the app uses ----------
const token = process.env.CLOUDFLARE_API_TOKEN
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set')
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? (await (await fetch('https://api.cloudflare.com/client/v4/accounts', { headers: H })).json()).result?.[0]?.id
if (!accountId) throw new Error('could not resolve the Cloudflare account id')
let trace = null // the shim records what the pipeline sent and what came back
const ai = {
  run: async (model, opts) => {
    if (model !== MODEL) throw new Error(`model mismatch: pipeline asked for ${model}`)
    const t0 = Date.now()
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, { method: 'POST', headers: H, body: JSON.stringify(opts) })
    const j = await res.json()
    trace = { ms: Date.now() - t0, http: res.status, raw: j.result?.response ?? '', opts, errors: j.errors }
    if (!res.ok || !j.success) throw new Error(`Workers AI ${res.status}: ${JSON.stringify(j.errors)}`)
    return { response: j.result.response }
  },
}

const rows = []
let healthyCalls = 0
for (const c of cases) {
  if (c.status === 'healthy') {
    trace = null
    const n = await m.generateCoachingNote(ai, c.ev)
    if (trace) healthyCalls++
    rows.push({ id: c.id, kind: c.kind, status: c.status, runs: [{ source: n.source, note: n }], model_called: !!trace })
    continue
  }
  const runs = []
  for (let r = 0; r < RUNS; r++) {
    trace = null
    const note = await m.generateCoachingNote(ai, c.ev)
    const raw = trace?.raw ?? ''
    const action = m.parseAction(raw)
    let check = action ? m.validateModelWording({ action }, c.facts) : { ok: false, reason: raw ? 'not a single-line reply' : 'no response' }
    if (check.ok && !m.addressesTopSignal(action, c.facts)) check = { ok: false, reason: 'does not address the decided signal' }
    if (check.ok && m.isVagueFiller(action)) check = { ok: false, reason: 'vague: only suggests a meeting or discussion' }
    runs.push({ source: note.source, note, raw, action, formatOk: !!action, valid: check.ok, reason: check.ok ? '' : check.reason, ms: trace?.ms ?? null })
    await new Promise((r2) => setTimeout(r2, 250))
  }
  rows.push({ id: c.id, kind: c.kind, status: c.status, runs, ev: c.ev, facts: c.facts })
  process.stdout.write('.')
}
console.log()

// ---------- metrics ----------
const modelRuns = rows.filter((r) => r.status !== 'healthy').flatMap((r) => r.runs)
const pct = (k, n) => `${((100 * k) / n).toFixed(1)}% (${k}/${n})`
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const lat = modelRuns.map((r) => r.ms).filter((x) => x != null)
const reasons = {}
for (const r of modelRuns.filter((x) => !x.valid)) { const k = r.reason.replace(/\d+(\.\d+)?/g, 'N'); reasons[k] = (reasons[k] ?? 0) + 1 }
const consistent = rows.filter((r) => r.status !== 'healthy').filter((r) => new Set(r.runs.map((x) => x.action)).size === 1).length
const modelCases = rows.filter((r) => r.status !== 'healthy').length
const withDigits = modelRuns.filter((r) => /\d/.test(r.raw)).length
const words = modelRuns.filter((r) => r.action).map((r) => r.action.split(/\s+/).length)
const startsSchedule = modelRuns.filter((r) => /^\s*(ACTION:\s*)?Schedule a/i.test(r.raw)).length
const vagueRaw = modelRuns.filter((r) => r.action && m.isVagueFiller(r.action)).length
const timeFrame = modelRuns.filter((r) => /\b(this sprint|next sprint|this week|next week|this quarter)\b/i.test(r.raw)).length
const distinct = new Set(modelRuns.map((r) => r.raw)).size

const lines = [
  '# Live-model evaluation of the current coaching pipeline',
  '',
  `Real model \`${MODEL}\` on Cloudflare Workers AI, called through the production \`generateCoachingNote\` (new prompt, validator, ${RUNS} runs per case, temperature 0). ${cases.length} cases: 16 real Platform/Backend team-weeks and the seeded profiles at weeks 5 and 8.`,
  '',
  '| Measure | Result |', '| --- | --- |',
  `| Healthy weeks that called the model (must be 0) | ${healthyCalls} of ${cases.length - needModel.length} |`,
  `| Model calls made | ${modelRuns.length} (${modelCases} cases x ${RUNS}) |`,
  `| Reply is a usable single-line action (label optional) | ${pct(modelRuns.filter((r) => r.formatOk).length, modelRuns.length)} |`,
  `| Wording passes the validator (note shown is model-written) | ${pct(modelRuns.filter((r) => r.valid).length, modelRuns.length)} |`,
  `| Fell back to the template (reply rejected or call failed) | ${pct(modelRuns.filter((r) => r.source === 'template').length, modelRuns.length)} |`,
  `| Reply contains any digit (prompt forbids numbers) | ${pct(withDigits, modelRuns.length)} |`,
  `| Reply starts with "Schedule a ..." | ${pct(startsSchedule, modelRuns.length)} |`,
  `| Reply only suggests a meeting or discussion (vague filler) | ${pct(vagueRaw, modelRuns.length)} |`,
  `| Reply gives a time frame ("this sprint", "this week" ...) | ${pct(timeFrame, modelRuns.length)} |`,
  `| Distinct replies across ${modelRuns.length} calls | ${distinct} |`,
  `| Same action text on all ${RUNS} runs of a case | ${pct(consistent, modelCases)} |`,
  `| Action length, words (median / max) | ${q(words, 0.5)} / ${Math.max(...words)} |`,
  `| Latency, ms (p50 / p95) | ${q(lat, 0.5)} / ${q(lat, 0.95)} |`,
  `| Status shown equals the code-derived status | 100% by construction |`,
  '',
  '**Why replies were rejected**', '', Object.keys(reasons).length ? Object.entries(reasons).map(([k, v]) => `- ${k}: ${v}`).join('\n') : '- none', '',
  '**Per case** (first run shown)', '', '| Case | Status | Source | Action shown |', '| --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.id} | ${r.status} | ${r.runs[0].source} | ${(r.runs[0].note.action ?? '').replace(/\|/g, '/')} |`), '',
]
fs.mkdirSync(`${ROOT}eval/validation/after/`, { recursive: true })
fs.writeFileSync(`${ROOT}eval/validation/after/live_model_eval.md`, lines.join('\n'))

// ---------- blinded sheet for human scoring (template action vs model action, order randomised) ----------
let seed = 99
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
const esc = (s) => `"${String(s).replace(/"/g, '""')}"`
const sheet = ['case,context,note_A_action,note_B_action,preferred(A/B),actionability_A(1-5),actionability_B(1-5),grounded_A(1-5),grounded_B(1-5)']
const key = ['case,A_is']
for (const r of rows.filter((x) => x.status !== 'healthy' && x.runs[0].source === 'model')) {
  const tpl = m.templateNote(r.facts).action, mod = r.runs[0].note.action
  const flip = rnd() < 0.5
  sheet.push([esc(r.id), esc(`${r.status}; ${r.facts.top.label} ${r.facts.top.display}`), esc(flip ? mod : tpl), esc(flip ? tpl : mod), '', '', '', '', ''].join(','))
  key.push(`${esc(r.id)},${flip ? 'model' : 'template'}`)
}
fs.writeFileSync(`${ROOT}eval/validation/after/live_model_blind_sheet.csv`, sheet.join('\n') + '\n')
fs.writeFileSync(`${ROOT}eval/validation/after/live_model_blind_key.csv`, key.join('\n') + '\n')
fs.writeFileSync(`${ROOT}eval/validation/after/live_model_raw.json`, JSON.stringify(rows.map((r) => ({ id: r.id, status: r.status, runs: r.runs.map((x) => ({ source: x.source, raw: x.raw, reason: x.reason, ms: x.ms })) })), null, 2))
console.log(lines.slice(0, 18).join('\n'))
