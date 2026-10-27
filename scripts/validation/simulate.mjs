// E2: seeded-scenario evaluation of Growth's early-warning detector.
// See report/validation_report.md for the design (FEDS: artificial, formative
// -> summative) and how to read the output.
//
// What this does
//   1. Generates synthetic teams (52 weeks) from seeded PRNGs: healthy
//      baselines + labelled strain episodes + benign confounders + null teams
//      + chronically-low teams (scripts/validation/scenarios.mjs).
//   2. Scores every week with the PRODUCTION scorer (src/logic/healthScore.js).
//   3. Runs several detectors on the SAME seeded series: the shipped rule
//      (production isEarlyWarning) and candidate rules from the Sprint 5 P1.
//   4. Reports recall, detection latency, false alarms per team-month, flag
//      persistence, benign-control fire rate, and stale flags after recovery,
//      with 95% CIs; plus a threshold sweep and noise / data-availability
//      sensitivity.
//
// What it can and cannot show: it establishes EFFICACY against OUR definition
// of strain. It cannot show that the definition matches real team health -
// that is what the expert, manager and pilot episodes (E1, E5, E6) are for.
//
// Run: node scripts/validation/simulate.mjs [--set=dev|heldout|both] [--n=40]
//        [--out=eval/validation]

import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { computeHealthScore, isEarlyWarning } from '../../src/logic/healthScore.js'
import {
  LIBRARY,
  WEEKS,
  BASELINE_RANGES,
  NOISE_SD,
} from './scenarios.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  })
)
const SETS = args.set === 'dev' ? ['dev'] : args.set === 'heldout' ? ['heldout'] : ['dev', 'heldout']
const N = Number(args.n ?? 40) // teams per scenario cell
const OUT_DIR = fileURLToPath(new URL(`../../${args.out ?? 'eval/validation'}/`, import.meta.url))

// Disjoint seed ranges so DEV and HELDOUT never share a random stream.
const SEED_BASE = { dev: 1_000_000, heldout: 9_000_000 }
const NOISES = { low: 0.25, mid: 1, high: 1.6, xhigh: 2.5 }
const SIGNAL_CONDITIONS = ['full', 'liveOnly']
const MAIN = { noise: 'mid', signals: 'full' }
const WEEKS_PER_MONTH = 52 / 12

// ---------------------------------------------------------------------------
// random + stats helpers
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(r) {
  let u = 0
  while (u === 0) u = r()
  const v = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN)

function quantile(sorted, q) {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function wilson(k, n, z = 1.96) {
  if (n === 0) return [NaN, NaN]
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}

// Bootstrap 95% CI of sum(episodes)/sum(weeks) * weeks-per-month, resampling teams.
function bootstrapRate(items, resamples = 400) {
  const r = mulberry32(424242)
  const point = (xs) =>
    (xs.reduce((s, x) => s + x.ep, 0) / Math.max(1, xs.reduce((s, x) => s + x.wk, 0))) * WEEKS_PER_MONTH
  if (!items.length) return { rate: NaN, ci: [NaN, NaN] }
  const draws = []
  for (let b = 0; b < resamples; b++) {
    const s = []
    for (let i = 0; i < items.length; i++) s.push(items[Math.floor(r() * items.length)])
    draws.push(point(s))
  }
  draws.sort((a, b) => a - b)
  return { rate: point(items), ci: [quantile(draws, 0.025), quantile(draws, 0.975)] }
}

// ---------------------------------------------------------------------------
// synthetic team generator
// ---------------------------------------------------------------------------

function effectAt(e, k, duration) {
  if (k < 0) return 0
  if (Number.isFinite(duration) && k >= duration) return 0
  const ramp = Math.min(1, (k + 1) / (e.rampIn ?? 1))
  const decay = Number.isFinite(duration) ? 1 - (e.decay ?? 0) * (k / duration) : 1
  return e.amount * ramp * decay
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d

function sampleBaseline(r) {
  const out = {}
  for (const [k, [lo, hi]] of Object.entries(BASELINE_RANGES)) out[k] = lo + r() * (hi - lo)
  return out
}

// A team's raw weekly series. The random stream depends only on `seed`, and
// noiseScale only rescales the same draws, so a team is the SAME team across
// detectors, noise levels and data-availability conditions (common random
// numbers), and the same seed always reproduces it.
function generateTeam(spec, seed, noiseScale) {
  const r = mulberry32(seed)
  const base = spec.baseline ?? sampleBaseline(r)
  const hasOnset = spec.kind === 'strain' || spec.kind === 'benign'
  const onset = hasOnset ? 16 + Math.floor(r() * 15) : null // weeks 16..30: a baseline exists
  const phi = 0.5
  const innov = Math.sqrt(1 - phi * phi)
  const z = Object.fromEntries(Object.keys(NOISE_SD).map((k) => [k, 0]))

  const weeks = []
  for (let t = 0; t < WEEKS; t++) {
    const v = {}
    for (const k of Object.keys(NOISE_SD)) {
      z[k] = phi * z[k] + innov * gauss(r)
      v[k] = base[k] + NOISE_SD[k] * noiseScale * z[k]
      const e = spec.effects[k]
      if (e && onset != null) {
        const eff = effectAt(e, t - onset, spec.duration)
        v[k] = e.mode === 'mul' ? v[k] * (1 + eff) : v[k] + eff
      }
    }
    weeks.push({
      jira: {
        avgCycleTimeDays: round(Math.max(0.8, v.cycleTime), 1),
        sprintCompletionPct: Math.round(Math.min(100, Math.max(0, v.completion))),
      },
      github: {
        avgReviewTurnaroundHours: round(Math.max(1, v.reviewTurnaround), 1),
        pctCommitsAfter7pm: Math.round(Math.min(80, Math.max(0, v.afterHours))),
      },
      calendar: { avgMeetingHoursPerWeek: round(Math.max(1, v.meeting), 1) },
    })
  }
  return { spec, seed, onset, weeks }
}

// Today's live teams: GitHub is a fixed placeholder and excluded from the score
// (scoring.ts / healthScore.js). 'liveOnly' reproduces exactly that.
const GITHUB_PLACEHOLDER = { avgReviewTurnaroundHours: 12, pctCommitsAfter7pm: 15 }

function scoreSeries(team, signals) {
  return team.weeks.map((w) =>
    signals === 'full'
      ? computeHealthScore(w)
      : computeHealthScore(
          { ...w, github: GITHUB_PLACEHOLDER },
          { jira: 'live', github: 'placeholder', calendar: 'live' }
        )
  )
}

// ---------------------------------------------------------------------------
// detectors (all take a score series, return a boolean flag per week)
// ---------------------------------------------------------------------------

// The shipped rule, called through the production function itself.
const shippedDetector = (scores) => scores.map((_, i) => isEarlyWarning(scores, i))

// Parametrised copy of the shipped rule, used for the sweep. For the default
// parameters it must equal shippedDetector (self-check below).
const baselineDetector =
  ({ ratio = 0.85, window = 3 } = {}) =>
  (scores) =>
    scores.map((s, i) => (i < window ? false : s < mean(scores.slice(i - window, i)) * ratio))

const fixedDetector = (cutoff) => (scores) => scores.map((s) => s < cutoff)

// Candidate rule from the Sprint 5 P1: the team's "normal" stops updating while
// it is below threshold (frozen baseline) and, optionally, a flag needs
// `minBad` consecutive bad weeks. `release` (exploratory) re-bases after that
// many consecutive bad weeks so a genuine new normal cannot flag forever.
const frozenDetector =
  ({ ratio = 0.85, window = 3, minBad = 1, release = Infinity } = {}) =>
  (scores) => {
    const flags = []
    const base = []
    let run = 0
    for (let i = 0; i < scores.length; i++) {
      if (base.length < window) {
        base.push(scores[i])
        flags.push(false)
        continue
      }
      const avg = mean(base.slice(-window))
      const bad = scores[i] < avg * ratio
      run = bad ? run + 1 : 0
      if (!bad) base.push(scores[i])
      else if (run >= release) {
        const recent = scores.slice(i - window + 1, i + 1)
        base.length = 0
        base.push(...recent)
        run = 0
        flags.push(false)
        continue
      }
      flags.push(run >= minBad)
    }
    return flags
  }

const DETECTORS = [
  { id: 'D0', label: 'Shipped: <85% of trailing 3-wk avg', fn: shippedDetector },
  { id: 'D1', label: 'Fixed cutoff <60', fn: fixedDetector(60) },
  { id: 'D2', label: 'Frozen baseline', fn: frozenDetector() },
  { id: 'D3', label: 'Frozen baseline + 2 bad weeks', fn: frozenDetector({ minBad: 2 }) },
]

// ---------------------------------------------------------------------------
// per-team metrics
// ---------------------------------------------------------------------------

function episodes(flags) {
  let n = 0
  for (let i = 0; i < flags.length; i++) if (flags[i] && !flags[i - 1]) n++
  return n
}

function evalTeam(flags, team) {
  const { spec, onset, seed } = team
  const base = { id: spec.id, kind: spec.kind, severity: spec.severity, seed, onset }
  if (spec.kind === 'null') {
    return { ...base, faEp: episodes(flags), faWk: flags.length }
  }
  if (spec.kind === 'chronic') {
    return { ...base, chronicShare: mean(flags.slice(8).map(Number)) }
  }
  const evEnd = onset + (Number.isFinite(spec.duration) ? spec.duration : 12)
  // "Caught" = a NEW flag episode starts inside the event window (rising edge).
  // A flag that was already on before the event (e.g. a chronically low team
  // under a fixed cutoff) is a standing alarm, not detection of the change.
  const stop = Math.min(flags.length, evEnd + 2)
  let first = -1
  for (let i = onset; i < stop; i++) {
    if (flags[i] && !flags[i - 1]) {
      first = i - onset
      break
    }
  }
  const caught = first >= 0
  return {
    ...base,
    caught,
    latency: caught ? first : null,
    inEvent: mean(flags.slice(onset, evEnd).map(Number)), // share of event weeks flagged
    stale: mean(flags.slice(evEnd + 4).map(Number)), // flagged long after the event ended
    faEp: episodes(flags.slice(0, onset)), // flags BEFORE anything happened
    faWk: onset,
  }
}

// ---------------------------------------------------------------------------
// aggregation
// ---------------------------------------------------------------------------

function summarize(records) {
  const strain = records.filter((r) => r.kind === 'strain')
  const benign = records.filter((r) => r.kind === 'benign')
  const chronic = records.filter((r) => r.kind === 'chronic')

  const recall = (rs) => {
    const k = rs.filter((r) => r.caught).length
    return { k, n: rs.length, p: rs.length ? k / rs.length : NaN, ci: wilson(k, rs.length) }
  }
  const lat = strain.filter((r) => r.caught).map((r) => r.latency).sort((a, b) => a - b)
  const faItems = records.filter((r) => r.faWk).map((r) => ({ ep: r.faEp, wk: r.faWk }))
  const growth = benign.filter((r) => r.id === 'team_growth')

  return {
    recall: recall(strain),
    recallSubtle: recall(strain.filter((r) => r.severity === 'subtle')),
    recallClear: recall(strain.filter((r) => r.severity === 'clear')),
    latency: { median: quantile(lat, 0.5), q1: quantile(lat, 0.25), q3: quantile(lat, 0.75) },
    stays: mean(strain.map((r) => r.inEvent)),
    staleAfterRecovery: mean(strain.map((r) => r.stale)),
    fa: bootstrapRate(faItems),
    benignFire: recall(benign),
    growthStuck: mean(growth.map((r) => r.stale)),
    chronicFlagged: mean(chronic.map((r) => r.chronicShare)),
  }
}

function byCell(records, kinds) {
  const cells = new Map()
  for (const r of records.filter((x) => kinds.includes(x.kind))) {
    const key = `${r.id}|${r.severity}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(r)
  }
  return cells
}

const pct = (x) => (Number.isNaN(x) ? 'n/a' : `${Math.round(x * 100)}%`)
const pctCI = (o) => `${pct(o.p)} [${pct(o.ci[0])}–${pct(o.ci[1])}]`
const num = (x, d = 1) => (Number.isNaN(x) ? 'n/a' : x.toFixed(d))
const faCell = (fa) => `${num(fa.rate, 2)} [${num(fa.ci[0], 2)}–${num(fa.ci[1], 2)}]`
const latCell = (l) => (Number.isNaN(l.median) ? 'n/a' : `${num(l.median, 1)} (${num(l.q1, 1)}–${num(l.q3, 1)})`)

// ---------------------------------------------------------------------------
// dataset construction + running
// ---------------------------------------------------------------------------

function buildDataset(setName, noiseScale) {
  const lib = LIBRARY[setName]
  const specs = [...lib, { kind: 'null', id: 'null_team', severity: '-', duration: 0, effects: {} }]
  const teams = []
  specs.forEach((spec, si) => {
    const count = spec.kind === 'null' ? N * 2 : N
    for (let i = 0; i < count; i++) {
      teams.push(generateTeam(spec, SEED_BASE[setName] + si * 10_000 + i * 13, noiseScale))
    }
  })
  return teams
}

function runDetectors(teams, signals, detectors = DETECTORS) {
  const series = teams.map((t) => scoreSeries(t, signals))
  return Object.fromEntries(
    detectors.map((d) => [d.id, teams.map((t, i) => evalTeam(d.fn(series[i]), t))])
  )
}

// ---------------------------------------------------------------------------
// self-checks: the harness must be trustworthy before its numbers are
// ---------------------------------------------------------------------------

function selfChecks() {
  const out = []
  const ok = (name, pass) => {
    out.push({ name, pass })
    if (!pass) process.exitCode = 1
  }

  const a = buildDataset('dev', 1)
  const b = buildDataset('dev', 1)
  ok('deterministic: same seeds reproduce identical teams', JSON.stringify(a) === JSON.stringify(b))

  // parametrised baseline == production isEarlyWarning on every series
  const param = baselineDetector()
  let same = true
  for (const t of a) {
    const s = scoreSeries(t, 'full')
    if (JSON.stringify(param(s)) !== JSON.stringify(shippedDetector(s))) same = false
  }
  ok('parametrised baseline detector == production isEarlyWarning on all dev series', same)

  // DEV and HELDOUT never share a seed
  const devSeeds = new Set(buildDataset('dev', 1).map((t) => t.seed))
  const held = buildDataset('heldout', 1)
  ok('dev and held-out seed ranges are disjoint', !held.some((t) => devSeeds.has(t.seed)))

  // noise only rescales the same draws: a null team's series order is stable
  const lo = generateTeam({ kind: 'null', id: 'x', severity: '-', duration: 0, effects: {} }, 5, 0.25)
  const hi = generateTeam({ kind: 'null', id: 'x', severity: '-', duration: 0, effects: {} }, 5, 1.6)
  const corr = (x, y) => {
    const mx = mean(x)
    const my = mean(y)
    const num = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0)
    const den = Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) * y.reduce((s, v) => s + (v - my) ** 2, 0))
    return num / den
  }
  ok(
    'common random numbers: same team at different noise scales is highly correlated',
    corr(lo.weeks.map((w) => w.jira.avgCycleTimeDays), hi.weeks.map((w) => w.jira.avgCycleTimeDays)) > 0.95
  )
  return out
}

// Manipulation check: do the seeded episodes actually move the composite?
function manipulationCheck(teams) {
  const rows = new Map()
  for (const t of teams.filter((x) => x.spec.kind === 'strain' || x.spec.kind === 'benign')) {
    const key = `${t.spec.id}|${t.spec.severity}`
    const s = scoreSeries(t, 'full')
    const pre = mean(s.slice(t.onset - 4, t.onset))
    const evEnd = t.onset + (Number.isFinite(t.spec.duration) ? t.spec.duration : 12)
    const ev = s.slice(t.onset, evEnd)
    if (!rows.has(key)) rows.set(key, { kind: t.spec.kind, meanDrop: [], worstDrop: [] })
    rows.get(key).meanDrop.push(pre - mean(ev))
    rows.get(key).worstDrop.push(pre - Math.min(...ev))
  }
  return [...rows.entries()].map(([key, v]) => ({
    key,
    kind: v.kind,
    meanDrop: mean(v.meanDrop),
    worstDrop: mean(v.worstDrop),
  }))
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

function mdTable(header, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n')
}

function reportSet(setName, results, teams) {
  const md = []
  const main = results[MAIN.noise][MAIN.signals]
  const label = setName === 'dev' ? 'DEV set' : 'HELD-OUT set'

  md.push(`### ${label} - main condition (noise x1, all five signals), ${N} teams per scenario cell\n`)

  // Table 1: headline per detector
  md.push('**Headline per detector** (strain recall pooled over 8 scenario cells; 95% CIs)\n')
  md.push(
    mdTable(
      ['Detector', 'Recall (all strain)', 'Subtle', 'Clear', 'Latency, wks (median, IQR)', 'Flag on during strain', 'False alarms / team-month', 'Benign controls fired', 'Stuck after team growth', 'Chronic-low flagged'],
      DETECTORS.map((d) => {
        const s = summarize(main[d.id])
        return [
          `${d.id} ${d.label}`,
          pctCI(s.recall),
          pctCI(s.recallSubtle),
          pctCI(s.recallClear),
          latCell(s.latency),
          pct(s.stays),
          faCell(s.fa),
          pctCI(s.benignFire),
          pct(s.growthStuck),
          pct(s.chronicFlagged),
        ]
      })
    )
  )

  // Table 2: recall by family x severity
  md.push('\n**Recall by scenario** (share of seeded strain episodes where a NEW flag starts within the episode + 2 weeks)\n')
  const cells = [...byCell(main.D0, ['strain']).keys()]
  md.push(
    mdTable(
      ['Scenario', 'Severity', ...DETECTORS.map((d) => d.id)],
      cells.map((key) => {
        const [id, sev] = key.split('|')
        return [
          id,
          sev,
          ...DETECTORS.map((d) => {
            const rs = byCell(main[d.id], ['strain']).get(key)
            const k = rs.filter((r) => r.caught).length
            return `${pct(k / rs.length)}`
          }),
        ]
      })
    )
  )

  // Table 3: benign controls
  md.push('\n**Benign controls** (a good detector does NOT fire; "fired" = a new flag episode during the event or 2 weeks after)\n')
  const bcells = [...byCell(main.D0, ['benign']).keys()]
  md.push(
    mdTable(
      ['Control', ...DETECTORS.map((d) => d.id + ' fired'), ...DETECTORS.map((d) => d.id + ' still flagged 4+ wks after')],
      bcells.map((key) => [
        key.split('|')[0],
        ...DETECTORS.map((d) => {
          const rs = byCell(main[d.id], ['benign']).get(key)
          return pct(rs.filter((r) => r.caught).length / rs.length)
        }),
        ...DETECTORS.map((d) => pct(mean(byCell(main[d.id], ['benign']).get(key).map((r) => r.stale)))),
      ])
    )
  )

  // Table 4: sensitivity (noise x data availability)
  md.push('\n**Sensitivity: noise level x data availability** (recall / false alarms per team-month)\n')
  const sensRows = []
  for (const noise of Object.keys(NOISES)) {
    for (const sig of SIGNAL_CONDITIONS) {
      sensRows.push([
        `x${NOISES[noise]}`,
        sig === 'full' ? 'all 5 signals' : 'live only (GitHub excluded)',
        ...DETECTORS.map((d) => {
          const s = summarize(results[noise][sig][d.id])
          return `${pct(s.recall.p)} / ${num(s.fa.rate, 2)}`
        }),
      ])
    }
  }
  md.push(mdTable(['Noise', 'Data', ...DETECTORS.map((d) => d.id)], sensRows))

  // Table 5: recall by family when GitHub is placeholder
  md.push('\n**What live-only data can and cannot see** (D0 recall by scenario, all 5 signals vs GitHub excluded)\n')
  md.push(
    mdTable(
      ['Scenario', 'Severity', 'All 5 signals', 'Live only (Jira + calendar)'],
      cells.map((key) => {
        const [id, sev] = key.split('|')
        const r = (sig) => {
          const rs = byCell(results[MAIN.noise][sig].D0, ['strain']).get(key)
          return pct(rs.filter((x) => x.caught).length / rs.length)
        }
        return [id, sev, r('full'), r('liveOnly')]
      })
    )
  )

  // Manipulation check
  md.push('\n**Manipulation check** (does each seeded episode actually move the composite score? mean drop vs the 4 weeks before onset, points)\n')
  md.push(
    mdTable(
      ['Scenario', 'Severity', 'Kind', 'Mean drop over episode', 'Mean worst-week drop'],
      manipulationCheck(teams).map((m) => {
        const [id, sev] = m.key.split('|')
        return [id, sev, m.kind, num(m.meanDrop), num(m.worstDrop)]
      })
    )
  )
  return md.join('\n')
}

// Threshold sweep on the main condition for one dataset.
function sweep(teams) {
  const series = teams.map((t) => scoreSeries(t, MAIN.signals))
  const rows = []
  const ratios = [0.95, 0.92, 0.9, 0.85, 0.8, 0.75]
  const windows = [3, 4, 8]
  const families = [
    { name: 'baseline (shipped rule)', make: (ratio, window) => baselineDetector({ ratio, window }) },
    { name: 'frozen + 2 bad wks', make: (ratio, window) => frozenDetector({ ratio, window, minBad: 2 }) },
  ]
  for (const fam of families) {
    for (const window of windows) {
      for (const ratio of ratios) {
        const det = fam.make(ratio, window)
        const recs = teams.map((t, i) => evalTeam(det(series[i]), t))
        const s = summarize(recs)
        rows.push({
          family: fam.name,
          window,
          threshold: ratio,
          recall: s.recall.p,
          latency: s.latency.median,
          fa: s.fa.rate,
          benignFire: s.benignFire.p,
        })
      }
    }
  }
  return rows
}

function sweepMarkdown(rows, label) {
  return [
    `### Threshold sweep - ${label} (noise x1, all signals; flag when score < threshold x trailing average)\n`,
    mdTable(
      ['Rule', 'Baseline window (wks)', 'Threshold', 'Strain recall', 'Median latency (wks)', 'False alarms / team-month', 'Benign controls fired'],
      rows.map((r) => [
        r.family,
        r.window,
        r.threshold.toFixed(2),
        pct(r.recall),
        num(r.latency, 1),
        num(r.fa, 2),
        pct(r.benignFire),
      ])
    ),
  ].join('\n')
}

function perTeamCsv(setName, results) {
  const header = ['dataset', 'detector', 'scenario', 'severity', 'kind', 'seed', 'onset_week', 'caught', 'latency_weeks', 'event_weeks_flagged', 'stale_weeks_flagged', 'fa_episodes_pre_onset', 'pre_onset_weeks']
  const lines = [header.join(',')]
  const main = results[MAIN.noise][MAIN.signals]
  for (const d of DETECTORS) {
    for (const r of main[d.id]) {
      lines.push(
        [setName, d.id, r.id, r.severity, r.kind, r.seed, r.onset ?? '', r.caught ?? '', r.latency ?? '', r.inEvent == null ? '' : r.inEvent.toFixed(3), r.stale == null ? '' : r.stale.toFixed(3), r.faEp ?? '', r.faWk ?? ''].join(',')
      )
    }
  }
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const checks = selfChecks()
  console.log('Self-checks:')
  for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`)
  if (checks.some((c) => !c.pass)) {
    console.error('Self-checks failed; refusing to report numbers.')
    process.exit(1)
  }

  await mkdir(OUT_DIR, { recursive: true })
  const md = [
    '# E2 results - seeded-scenario evaluation of the early-warning detector\n',
    `Generated by \`scripts/validation/simulate.mjs\`. ${N} teams per scenario cell (${N * 2} null teams), ${WEEKS} weeks each, seeds disjoint between DEV and HELD-OUT. Re-running reproduces every number.\n`,
    '**Self-checks passed:**\n' + checks.map((c) => `- ${c.name}`).join('\n') + '\n',
  ]
  const json = { generated: 'scripts/validation/simulate.mjs', teamsPerCell: N, sets: {} }

  for (const setName of SETS) {
    const results = {}
    for (const [noiseName, scale] of Object.entries(NOISES)) {
      const teams = buildDataset(setName, scale)
      results[noiseName] = {}
      for (const sig of SIGNAL_CONDITIONS) results[noiseName][sig] = runDetectors(teams, sig)
    }
    const mainTeams = buildDataset(setName, NOISES[MAIN.noise])
    md.push(reportSet(setName, results, mainTeams))
    md.push('\n' + sweepMarkdown(sweep(mainTeams), setName === 'dev' ? 'DEV set' : 'HELD-OUT set') + '\n')
    json.sets[setName] = Object.fromEntries(
      Object.entries(results).map(([noise, bySig]) => [
        noise,
        Object.fromEntries(
          Object.entries(bySig).map(([sig, byDet]) => [
            sig,
            Object.fromEntries(Object.entries(byDet).map(([id, recs]) => [id, summarize(recs)])),
          ])
        ),
      ])
    )
    await writeFile(`${OUT_DIR}e2_team_results_${setName}.csv`, perTeamCsv(setName, results))
  }

  await writeFile(`${OUT_DIR}e2_results.md`, md.join('\n') + '\n')
  await writeFile(`${OUT_DIR}e2_summary.json`, JSON.stringify(json, null, 2) + '\n')
  console.log(`\nWrote ${OUT_DIR}e2_results.md, e2_summary.json, e2_team_results_*.csv`)
}

// Reusable by faithfulness.mjs / export-e5-scenarios.mjs (same seeded teams).
export { generateTeam, scoreSeries, buildDataset, shippedDetector, evalTeam, summarize, SEED_BASE, NOISES, GITHUB_PLACEHOLDER }

// Only run the evaluation when executed directly, not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
