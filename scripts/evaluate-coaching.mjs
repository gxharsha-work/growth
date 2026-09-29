// Full evaluation harness for the AI coaching layer (Sprint 5).
//
// Test set: all 16 real team-weeks (Platform + Backend, weeks 1-8, each run
// 5x to measure run-to-run consistency) plus 5 constructed edge cases (run
// once each): calendar signal unavailable, flat/stable team, a team
// recovering after an early warning, no same-cohort peer, and Solstice's
// real live data.
//
// Configs compared:
//   A - a deterministic rule-based template (no LLM at all) — the floor
//   B - the ORIGINAL coaching prompt (free-text paragraph, pre-Sprint-5-fix)
//   C - the CURRENT tightened prompt (structured STATUS/SIGNAL/ACTION)
//   D - config C's prompt on a larger model (opt-in via --configs=A,B,C,D;
//       skipped by default since it roughly doubles Workers AI usage)
//
// B/C/D all call POST /api/eval/insight (functions/api/_lib/app.ts), which
// reuses the SAME evidence-formatting function (buildPrompt) the real
// production endpoint uses, so only the system prompt / model actually
// differs between configs — not the input text.
//
// Metrics (computed per row, aggregated per config): status agreement with
// the deterministic baseline, false-alarm rate, miss rate, number
// grounding, comparison-direction accuracy, driver match, 5-run status
// consistency, format validity, and p50/p95 latency. All of these are
// heuristic (regex-based) except status/latency — see the CAVEATS section
// printed at the end of the summary.
//
// Output: eval/results.csv (every row, with two blank columns for two
// teammates to hand-score actionability 1-5) plus a markdown summary table
// printed to stdout.
//
// Usage: node scripts/evaluate-coaching.mjs [--configs=A,B,C] [--base=<url>]

import { writeFile, mkdir } from 'node:fs/promises'
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
} from '../src/logic/healthScore.js'

// ---------- CLI args ----------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  })
)
const BASE = args.base ?? 'https://growth-3it.pages.dev'
const ACTIVE_CONFIGS = (args.configs ?? 'A,B,C').split(',').map((s) => s.trim().toUpperCase())
const REPEATS = Number(args.repeats ?? 5)

// ---------- signal metadata (mirrors healthScore.js's WEIGHTS exactly) ----------

const SIGNAL_META = [
  {
    key: 'avgCycleTimeDays',
    label: 'Cycle time',
    weight: WEIGHTS.cycleTime,
    normalize: normalizeCycleTime,
    keywords: ['cycle time', 'cycle-time'],
    format: (v) => `${v.toFixed(1)}d`,
  },
  {
    key: 'sprintCompletionPct',
    label: 'Sprint completion',
    weight: WEIGHTS.completion,
    normalize: normalizeCompletion,
    keywords: ['sprint completion', 'completion rate', 'completion'],
    format: (v) => `${Math.round(v)}%`,
  },
  {
    key: 'avgReviewTurnaroundHours',
    label: 'Review turnaround',
    weight: WEIGHTS.reviewTurnaround,
    normalize: normalizeReviewTurnaround,
    keywords: ['review turnaround', 'code review', 'review time'],
    format: (v) => `${v.toFixed(1)}h`,
  },
  {
    key: 'pctCommitsAfter7pm',
    label: 'After-hours commits',
    weight: WEIGHTS.afterHoursCommits,
    normalize: normalizeAfterHoursCommits,
    keywords: ['after-hours', 'after 7pm', 'after hours', 'late-night', 'late night'],
    format: (v) => `${Math.round(v)}%`,
  },
  {
    key: 'avgMeetingHoursPerWeek',
    label: 'Meeting load',
    weight: WEIGHTS.meetingLoad,
    normalize: normalizeMeetingLoad,
    keywords: ['meeting load', 'meeting', 'meetings'],
    format: (v) => `${v.toFixed(1)}h/week`,
  },
]
const SIGNAL_KEYS = SIGNAL_META.map((m) => m.key)

// Weighted "badness" (0-100, higher = worse) per signal; the top one is
// what the deterministic composite score is actually most sensitive to.
function topContributingSignal(signals) {
  let worst = null
  for (const meta of SIGNAL_META) {
    const raw = signals[meta.key]
    if (raw === undefined || raw === null) continue // e.g. the "calendar unavailable" edge case
    const normalized = meta.normalize(raw)
    const deficit = (100 - normalized) * meta.weight
    if (!worst || deficit > worst.deficit) worst = { ...meta, deficit, value: raw }
  }
  return worst
}

// ---------- prompts under test ----------

const MODEL_8B = '@cf/meta/llama-3.1-8b-instruct-fp8'
const MODEL_70B = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

// Config B: the ORIGINAL prompt this project shipped with (commit 98769a9),
// before the Sprint 5 usability fix tightened it into a structured format.
const PROMPT_B = `You are a coaching assistant inside Growth, a tool engineering managers use to \
monitor team health. You will be given this week's team-level metrics for ONE team, already \
aggregated — you never see any individual person's data.

Write a short coaching note (3-5 sentences, plain text, no markdown/bullets) for the manager. Rules, \
all mandatory:
1. Only reference numbers and facts given to you below. Never invent a metric, a person, or a cause.
2. Never diagnose burnout, predict attrition, or make any claim about a specific individual — you \
only have team-level aggregates, so there is nothing individual to discuss anyway.
3. Frame everything as "worth investigating" or "worth checking in on," never as a certainty or verdict.
4. Name the ONE or TWO signals that most explain this week's score, using the peer comparison as \
context for whether a number is actually unusual for a team like this, not just different.
5. End with one concrete, low-effort suggested next step for the manager (e.g. a specific question to \
ask in a 1:1, a specific process to review) — not a generic platitude.
6. If early-warning is NOT triggered and the trend is stable or improving, say so plainly and briefly \
instead of manufacturing concern.`

// Config C: the CURRENT production prompt (functions/api/_lib/coaching.ts).
// Kept as a literal copy here (not imported) so this harness can run
// standalone in plain Node without a TypeScript loader; if coaching.ts's
// prompt changes, update this string to match.
const PROMPT_C = `You are a coaching assistant inside Growth, a tool engineering managers use to \
monitor team health. You will be given this week's team-level metrics for ONE team, already \
aggregated — you never see any individual person's data.

Reply with EXACTLY three lines, this format, nothing before or after:
STATUS: <5 words max — the one-line verdict, e.g. "Worth investigating" or "Healthy, stable">
SIGNAL: <under 18 words — the ONE signal that most explains this week's score, with the peer number for context>
ACTION: <under 16 words — one concrete, specific next step for the manager>

Rules, all mandatory:
1. Only reference numbers and facts given to you below. Never invent a metric, a person, or a cause.
2. Never diagnose burnout, predict attrition, or make any claim about a specific individual — you \
only have team-level aggregates, so there is nothing individual to discuss anyway.
3. Frame concern as "worth investigating," never as a certainty or verdict.
4. Double-check any comparison you make against the peer's number is actually in the right direction \
(a LOWER number than the peer is not "high" just because it's being mentioned).
5. If early-warning is NOT triggered and the trend is stable or improving, STATUS should say so \
plainly (e.g. "Healthy, stable") — do not manufacture concern out of a normal number.
6. No markdown, no bullets, no extra commentary — exactly the three labeled lines above.`

const CONFIGS = {
  A: { label: 'A: Rule-based template (no LLM)', type: 'template' },
  B: { label: 'B: Original prompt (8B, pre-fix)', type: 'llm', model: MODEL_8B, systemPrompt: PROMPT_B },
  C: { label: 'C: Tightened prompt (8B, production)', type: 'llm', model: MODEL_8B, systemPrompt: PROMPT_C },
  D: { label: 'D: Tightened prompt (70B)', type: 'llm', model: MODEL_70B, systemPrompt: PROMPT_C },
}

// ---------- evidence construction ----------

function evidenceSignals(row) {
  const { jira, github, calendar } = row
  return {
    avgCycleTimeDays: jira.avgCycleTimeDays,
    sprintCompletionPct: jira.sprintCompletionPct,
    avgReviewTurnaroundHours: github.avgReviewTurnaroundHours,
    pctCommitsAfter7pm: github.pctCommitsAfter7pm,
    avgMeetingHoursPerWeek: calendar.avgMeetingHoursPerWeek,
  }
}

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}

async function buildRealTeamWeekCases() {
  const [platform, backend] = await Promise.all([
    getJSON('/api/teams/platform/signals'),
    getJSON('/api/teams/backend/signals'),
  ])
  const rows = { platform: platform.weeks, backend: backend.weeks }
  const scores = {
    platform: rows.platform.map(computeHealthScore),
    backend: rows.backend.map(computeHealthScore),
  }
  const cohort = { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' }
  const names = { platform: 'Platform Team', backend: 'Backend Team' }
  const peerOf = { platform: 'backend', backend: 'platform' }

  const cases = []
  for (const team of ['platform', 'backend']) {
    for (let i = 0; i < 8; i++) {
      const peerId = peerOf[team]
      cases.push({
        id: `${team}-w${i + 1}`,
        label: `${names[team]}, week ${i + 1}`,
        type: 'real',
        repeats: REPEATS,
        evidence: {
          team: { name: names[team], cohort },
          week: i + 1,
          score: scores[team][i],
          trend: i > 0 ? scores[team][i] - scores[team][i - 1] : 0,
          earlyWarning: isEarlyWarning(scores[team], i),
          signals: evidenceSignals(rows[team][i]),
          peer: {
            name: names[peerId],
            score: scores[peerId][i],
            signals: evidenceSignals(rows[peerId][i]),
          },
        },
      })
    }
  }
  return cases
}

async function buildEdgeCases() {
  const cohort = { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' }
  const genericPeer = {
    name: 'Peer Team',
    score: 85,
    signals: {
      avgCycleTimeDays: 2.2,
      sprintCompletionPct: 88,
      avgReviewTurnaroundHours: 6,
      pctCommitsAfter7pm: 7,
      avgMeetingHoursPerWeek: 5.5,
    },
  }

  const cases = [
    {
      id: 'edge-no-calendar',
      label: 'Edge: calendar signal unavailable',
      type: 'edge',
      repeats: 1,
      evidence: {
        team: { name: 'Ops Team', cohort },
        week: 4,
        score: 62,
        trend: -4,
        earlyWarning: false,
        signals: {
          avgCycleTimeDays: 4.5,
          sprintCompletionPct: 65,
          avgReviewTurnaroundHours: 12,
          pctCommitsAfter7pm: 15,
          avgMeetingHoursPerWeek: undefined, // <- the thing being tested: a genuinely missing signal
        },
        peer: genericPeer,
      },
    },
    {
      id: 'edge-flat-stable',
      label: 'Edge: flat, stable team',
      type: 'edge',
      repeats: 1,
      evidence: {
        team: { name: 'Steady Team', cohort },
        week: 5,
        score: 75,
        trend: 0,
        earlyWarning: false,
        signals: {
          avgCycleTimeDays: 3.0,
          sprintCompletionPct: 75,
          avgReviewTurnaroundHours: 10,
          pctCommitsAfter7pm: 10,
          avgMeetingHoursPerWeek: 6,
        },
        peer: genericPeer,
      },
    },
    {
      id: 'edge-recovering',
      label: 'Edge: recovering after an early warning',
      type: 'edge',
      repeats: 1,
      evidence: {
        team: { name: 'Rebound Team', cohort },
        week: 7,
        score: 68,
        trend: 18, // was ~50 last week, jumped up
        earlyWarning: false, // recovered past the trailing-baseline threshold
        signals: {
          avgCycleTimeDays: 4.0,
          sprintCompletionPct: 66,
          avgReviewTurnaroundHours: 11,
          pctCommitsAfter7pm: 18,
          avgMeetingHoursPerWeek: 9,
        },
        peer: genericPeer,
      },
    },
    {
      id: 'edge-no-peer',
      label: 'Edge: no same-cohort peer available',
      type: 'edge',
      repeats: 1,
      evidence: {
        team: { name: 'Solo Team', cohort: { sizeBucket: '1-5 engineers', functionType: 'Data Science' } },
        week: 6,
        score: 50,
        trend: -10,
        earlyWarning: true,
        signals: {
          avgCycleTimeDays: 5.5,
          sprintCompletionPct: 52,
          avgReviewTurnaroundHours: 18,
          pctCommitsAfter7pm: 22,
          avgMeetingHoursPerWeek: 11,
        },
        // no `peer` key at all
      },
    },
  ]

  // 5th edge case: Solstice's real, live data — genuinely no same-cohort
  // peer exists among current teams (different cohort from Platform/
  // Backend), so this is a real-world instance of the "no peer" condition,
  // not a synthetic one.
  try {
    const solsticeSignals = await getJSON('/api/teams/solstice/signals')
    const solsticeWeeks = solsticeSignals.weeks
    if (solsticeWeeks.length > 0) {
      const scores = solsticeWeeks.map(computeHealthScore)
      const last = scores.length - 1
      cases.push({
        id: 'edge-solstice-real',
        label: 'Edge: Solstice (real ingested data)',
        type: 'edge',
        repeats: 1,
        evidence: {
          team: {
            name: 'Growth (Solstice Outdoors)',
            cohort: { sizeBucket: '1-5 engineers', functionType: 'Growth Marketing' },
          },
          week: solsticeWeeks[last].week,
          score: scores[last],
          trend: last > 0 ? scores[last] - scores[last - 1] : 0,
          earlyWarning: isEarlyWarning(scores, last),
          signals: evidenceSignals(solsticeWeeks[last]),
        },
      })
    }
  } catch (err) {
    console.warn('Could not build the Solstice-real-data edge case:', err.message)
  }

  return cases
}

// ---------- config runners ----------

function formatSignalValue(meta, value) {
  return meta.format(value)
}

function templateNote(evidence) {
  const driver = topContributingSignal(evidence.signals)
  const status = evidence.earlyWarning ? 'Worth investigating' : 'Healthy, stable'
  if (!driver) {
    return { status, signal: 'No signals available this week.', action: 'Await next data refresh.' }
  }
  const peerValue = evidence.peer?.signals?.[driver.key]
  const peerPart = peerValue !== undefined ? ` (peer: ${formatSignalValue(driver, peerValue)})` : ''
  return {
    status,
    signal: `${driver.label} is ${formatSignalValue(driver, driver.value)}${peerPart}`,
    action: evidence.earlyWarning
      ? `Review ${driver.label.toLowerCase()} with the team this week.`
      : 'No action needed — keep monitoring.',
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function callEvalEndpoint(model, systemPrompt, evidence, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const start = Date.now()
    try {
      const res = await fetch(`${BASE}/api/eval/insight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, systemPrompt, evidence }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      return { raw: body.raw, latencyMs: body.latencyMs ?? Date.now() - start, error: null }
    } catch (err) {
      if (attempt === retries) return { raw: '', latencyMs: Date.now() - start, error: err.message }
      await sleep(500 * attempt)
    }
  }
}

// ---------- parsing + metrics ----------

const LINE_PATTERN = /^(STATUS|SIGNAL|ACTION)\s*:\s*(.+)$/im

function parseStructured(raw) {
  const note = { status: '', signal: '', action: '' }
  for (const line of raw.split('\n')) {
    const m = line.match(LINE_PATTERN)
    if (!m) continue
    note[m[1].toLowerCase()] = m[2].trim()
  }
  return note
}

function formatValid(note) {
  return Boolean(note.status && note.signal && note.action)
}

function indicatesConcern(text) {
  return /worth investigat|worth check(ing)? in|concern|declin|risk|warning|struggl|behind|falling|slipping/i.test(
    text
  )
}

// Small integers (1, 2) are excluded — the prompts themselves say things
// like "one or two signals" and "a 1:1", which would otherwise constantly
// false-flag as ungrounded. This is a known imprecision in this metric,
// documented in the printed caveats.
function collectGroundedNumbers(evidence) {
  const nums = new Set()
  const add = (n) => {
    if (n === undefined || n === null || Number.isNaN(n)) return
    nums.add(Math.round(n * 10) / 10)
    nums.add(Math.round(n))
  }
  add(evidence.score)
  add(evidence.trend)
  add(Math.abs(evidence.trend))
  for (const key of SIGNAL_KEYS) add(evidence.signals?.[key])
  if (evidence.peer) {
    add(evidence.peer.score)
    for (const key of SIGNAL_KEYS) add(evidence.peer.signals?.[key])
  }
  return nums
}

function numberGroundingCheck(text, evidence) {
  const grounded = collectGroundedNumbers(evidence)
  const found = (text.match(/\d+(\.\d+)?/g) || []).map(Number).filter((n) => n !== 1 && n !== 2)
  if (found.length === 0) return { pass: true, checked: 0, ungrounded: [] }
  const ungrounded = found.filter((n) => !grounded.has(Math.round(n * 10) / 10) && !grounded.has(Math.round(n)))
  return { pass: ungrounded.length === 0, checked: found.length, ungrounded }
}

const HIGHER_WORDS = ['higher', 'more', 'longer', 'slower', 'above', 'greater', 'exceeds', 'worse']
const LOWER_WORDS = ['lower', 'less', 'shorter', 'faster', 'below', 'under', 'fewer', 'better']

function comparisonDirectionCheck(text) {
  const tokens = text.split(/\s+/)
  const numIdx = []
  tokens.forEach((t, i) => {
    if (/\d+(\.\d+)?/.test(t)) numIdx.push(i)
  })
  const checks = []
  for (let a = 0; a < numIdx.length; a++) {
    for (let b = a + 1; b < numIdx.length; b++) {
      const i1 = numIdx[a]
      const i2 = numIdx[b]
      if (i2 - i1 > 12) continue
      const between = tokens.slice(i1, i2 + 1).join(' ').toLowerCase()
      const higher = HIGHER_WORDS.some((w) => between.includes(w))
      const lower = LOWER_WORDS.some((w) => between.includes(w))
      if (!higher && !lower) continue
      const n1 = parseFloat(tokens[i1].replace(/[^\d.]/g, ''))
      const n2 = parseFloat(tokens[i2].replace(/[^\d.]/g, ''))
      if (Number.isNaN(n1) || Number.isNaN(n2) || n1 === n2) continue
      checks.push({ pass: higher === n1 > n2 })
      break // one comparison per number-pair span is enough signal
    }
  }
  if (checks.length === 0) return { checked: false, pass: null }
  return { checked: true, pass: checks.every((c) => c.pass) }
}

function driverMatchCheck(text, evidence) {
  const driver = topContributingSignal(evidence.signals)
  if (!driver) return null
  const lower = text.toLowerCase()
  return driver.keywords.some((k) => lower.includes(k))
}

// ---------- CSV ----------

function csvEscape(value) {
  const s = String(value ?? '').replace(/\r?\n/g, ' | ')
  return `"${s.replace(/"/g, '""')}"`
}

const CSV_HEADER = [
  'config',
  'case_id',
  'case_label',
  'case_type',
  'run_index',
  'team',
  'week',
  'baseline_status',
  'model',
  'raw_output',
  'parsed_status',
  'parsed_signal',
  'parsed_action',
  'indicates_concern',
  'status_agrees_with_baseline',
  'number_grounding_pass',
  'numbers_checked',
  'comparison_checked',
  'comparison_direction_pass',
  'driver_expected',
  'driver_match',
  'format_valid',
  'latency_ms',
  'error',
  'actionability_teammate1_1to5',
  'actionability_teammate2_1to5',
]

// ---------- main ----------

async function runCase(config, configKey, testCase, runIndex) {
  const { evidence } = testCase
  let raw
  let latencyMs = 0
  let error = null

  if (config.type === 'template') {
    const note = templateNote(evidence)
    raw = `STATUS: ${note.status}\nSIGNAL: ${note.signal}\nACTION: ${note.action}`
  } else {
    const result = await callEvalEndpoint(config.model, config.systemPrompt, evidence)
    raw = result.raw
    latencyMs = result.latencyMs
    error = result.error
  }

  const note = parseStructured(raw || '')
  const combinedText = raw || ''
  const concern = combinedText ? indicatesConcern(combinedText) : null
  const grounding = combinedText ? numberGroundingCheck(combinedText, evidence) : { pass: null, checked: 0 }
  const comparison = combinedText ? comparisonDirectionCheck(combinedText) : { checked: false, pass: null }
  const driver = topContributingSignal(evidence.signals)
  const driverMatch = combinedText ? driverMatchCheck(combinedText, evidence) : null

  return {
    config: configKey,
    case_id: testCase.id,
    case_label: testCase.label,
    case_type: testCase.type,
    run_index: runIndex,
    team: evidence.team.name,
    week: evidence.week,
    baseline_status: evidence.earlyWarning ? 'warning' : 'healthy',
    model: config.type === 'template' ? 'n/a' : config.model,
    raw_output: raw,
    parsed_status: note.status,
    parsed_signal: note.signal,
    parsed_action: note.action,
    indicates_concern: concern,
    status_agrees_with_baseline: error ? null : concern === evidence.earlyWarning,
    number_grounding_pass: error ? null : grounding.pass,
    numbers_checked: grounding.checked ?? 0,
    comparison_checked: comparison.checked,
    comparison_direction_pass: comparison.pass,
    driver_expected: driver?.label ?? '',
    driver_match: error ? null : driverMatch,
    format_valid: error ? false : formatValid(note),
    latency_ms: latencyMs,
    error: error ?? '',
    actionability_teammate1_1to5: '',
    actionability_teammate2_1to5: '',
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function summarize(configKey, rows) {
  const valid = rows.filter((r) => !r.error)
  const withBaseline = valid.filter((r) => r.status_agrees_with_baseline !== null)
  const healthy = withBaseline.filter((r) => r.baseline_status === 'healthy')
  const warning = withBaseline.filter((r) => r.baseline_status === 'warning')
  const falseAlarms = healthy.filter((r) => !r.status_agrees_with_baseline)
  const misses = warning.filter((r) => !r.status_agrees_with_baseline)
  const groundingRows = valid.filter((r) => r.number_grounding_pass !== null)
  const comparisonRows = valid.filter((r) => r.comparison_checked)
  const driverRows = valid.filter((r) => r.driver_match !== null)
  const latencies = valid.map((r) => r.latency_ms).filter((n) => n > 0).sort((a, b) => a - b)

  // status consistency: among the 16 real cases (5 runs each), what
  // fraction of runs agree with that case's own majority vote
  const byCase = new Map()
  for (const r of rows) {
    if (r.case_type !== 'real') continue
    if (!byCase.has(r.case_id)) byCase.set(r.case_id, [])
    byCase.get(r.case_id).push(r.indicates_concern)
  }
  let consistencySum = 0
  let consistencyCases = 0
  for (const votes of byCase.values()) {
    const clean = votes.filter((v) => v !== null)
    if (clean.length === 0) continue
    const trueCount = clean.filter(Boolean).length
    const majority = trueCount >= clean.length / 2
    const agreeing = clean.filter((v) => v === majority).length
    consistencySum += agreeing / clean.length
    consistencyCases += 1
  }

  const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : 'n/a')

  return {
    config: configKey,
    n: rows.length,
    errors: rows.length - valid.length,
    statusAgreement: pct(withBaseline.filter((r) => r.status_agrees_with_baseline).length, withBaseline.length),
    falseAlarmRate: pct(falseAlarms.length, healthy.length),
    missRate: pct(misses.length, warning.length),
    numberGrounding: pct(groundingRows.filter((r) => r.number_grounding_pass).length, groundingRows.length),
    comparisonAccuracy:
      comparisonRows.length > 0
        ? pct(comparisonRows.filter((r) => r.comparison_direction_pass).length, comparisonRows.length)
        : 'n/a (none detected)',
    driverMatch: pct(driverRows.filter((r) => r.driver_match).length, driverRows.length),
    statusConsistency: consistencyCases > 0 ? pct(consistencySum, consistencyCases) : 'n/a',
    formatValidity: pct(rows.filter((r) => r.format_valid).length, rows.length),
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
  }
}

async function main() {
  console.log(`Base URL: ${BASE}`)
  console.log(`Configs: ${ACTIVE_CONFIGS.join(', ')}`)
  console.log(`Repeats for real team-weeks: ${REPEATS}\n`)

  console.log('Building test set...')
  const realCases = await buildRealTeamWeekCases()
  const edgeCases = await buildEdgeCases()
  const allCases = [...realCases, ...edgeCases]
  console.log(`  ${realCases.length} real team-week cases, ${edgeCases.length} edge cases\n`)

  const allRows = []
  for (const configKey of ACTIVE_CONFIGS) {
    const config = CONFIGS[configKey]
    if (!config) {
      console.warn(`Unknown config "${configKey}", skipping`)
      continue
    }
    console.log(`Running config ${config.label}...`)
    let done = 0
    const total = allCases.reduce((sum, c) => sum + (c.repeats ?? 1), 0)
    for (const testCase of allCases) {
      const repeats = testCase.repeats ?? 1
      for (let run = 1; run <= repeats; run++) {
        const row = await runCase(config, configKey, testCase, run)
        allRows.push(row)
        done += 1
        if (config.type === 'llm') await sleep(150) // light pacing to be kind to the free-tier quota
        if (done % 10 === 0 || done === total) process.stdout.write(`  ${done}/${total}\r`)
      }
    }
    console.log(`  ${total}/${total} done`)
  }

  // ---------- write CSV ----------
  const outDir = fileURLToPath(new URL('../eval', import.meta.url))
  await mkdir(outDir, { recursive: true })
  const csvLines = [CSV_HEADER.join(',')]
  for (const row of allRows) {
    csvLines.push(CSV_HEADER.map((col) => csvEscape(row[col])).join(','))
  }
  const outPath = fileURLToPath(new URL('../eval/results.csv', import.meta.url))
  await writeFile(outPath, csvLines.join('\n') + '\n')
  console.log(`\nWrote ${allRows.length} rows to eval/results.csv`)

  // ---------- summary ----------
  console.log('\n## Sprint 5 coaching evaluation — summary\n')
  console.log(
    '| Config | N | Status Agree | False Alarm | Miss Rate | Number Grounding | Comparison Dir. | Driver Match | 5-Run Consistency | Format Valid | p50 (ms) | p95 (ms) | Errors |'
  )
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const configKey of ACTIVE_CONFIGS) {
    const rows = allRows.filter((r) => r.config === configKey)
    if (rows.length === 0) continue
    const s = summarize(configKey, rows)
    console.log(
      `| ${CONFIGS[configKey].label} | ${s.n} | ${s.statusAgreement} | ${s.falseAlarmRate} | ${s.missRate} | ${s.numberGrounding} | ${s.comparisonAccuracy} | ${s.driverMatch} | ${s.statusConsistency} | ${s.formatValidity} | ${s.p50 ?? 'n/a'} | ${s.p95 ?? 'n/a'} | ${s.errors} |`
    )
  }

  console.log(`
**Caveats on these metrics** (heuristic, not human-verified):
- Number grounding / comparison direction are regex-based text checks, not semantic understanding —
  they can miss paraphrased numbers ("about six days") and mis-parse unusual phrasing.
- "1" and "2" are excluded from grounding checks (both prompts legitimately say things like
  "one or two signals" and reference "a 1:1").
- Status agreement treats any concern-adjacent language as "flagged" — a real manager's read of
  tone may differ.
- Actionability (1-5) is NOT computed here — eval/results.csv has two blank columns
  (actionability_teammate1_1to5, actionability_teammate2_1to5) for two people to hand-score.
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
