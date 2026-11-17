// Experiment for Sprint 7 priority #4: does per-signal change detection (CUSUM) alongside the composite
// rule catch the subtle strain the composite dilutes, at an acceptable false-alarm cost?
//
//   D0  shipped rule (score < 85% of trailing 3-week average)            <- the control
//   D4  D0 OR a one-sided CUSUM on each signal's normalised goodness score
//
// The composite averages five signals, so a 25-point fall in ONE signal moves it ~5 points and is lost in
// noise; and a slow ramp drags its own trailing baseline down. CUSUM accumulates small persistent
// shortfalls against an OLDER baseline (8 weeks, lagged 2), so it can see both.
//
// Discipline: parameters are chosen on the DEV set only; HELD-OUT is run once with the chosen parameters.
// Target (Sprint 7 priority #4): subtle recall >= 50% at <= 0.05 false alarms per team-month.
//
// Run: node scripts/validation/persignal.mjs                 (DEV grid)
//      node scripts/validation/persignal.mjs --final --k=0.5 --h=5   (HELD-OUT once + sensitivity)

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  normalizeCycleTime, normalizeCompletion, normalizeReviewTurnaround, normalizeAfterHoursCommits, normalizeMeetingLoad,
} from '../../src/logic/healthScore.js'
import { buildDataset, scoreSeries, shippedDetector, evalTeam, summarize, NOISES } from './simulate.mjs'

const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
const ROOT = fileURLToPath(new URL('../../', import.meta.url))

const ALL = [
  ['cycle time', (w) => normalizeCycleTime(w.jira.avgCycleTimeDays), 'jira'],
  ['sprint completion', (w) => normalizeCompletion(w.jira.sprintCompletionPct), 'jira'],
  ['review turnaround', (w) => normalizeReviewTurnaround(w.github.avgReviewTurnaroundHours), 'github'],
  ['after-hours commits', (w) => normalizeAfterHoursCommits(w.github.pctCommitsAfter7pm), 'github'],
  ['meeting load', (w) => normalizeMeetingLoad(w.calendar.avgMeetingHoursPerWeek), 'calendar'],
]
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))) }

// One-sided (downward) CUSUM per signal. `useGithub = false` drops the placeholder GitHub signals.
export function cusumFlags(weeks, { window = 8, lag = 2, k = 0.5, h = 5, sigmaFloor = 3, useGithub = true } = {}) {
  const flags = new Array(weeks.length).fill(false)
  for (const [, f, source] of ALL) {
    if (!useGithub && source === 'github') continue
    const x = weeks.map(f)
    let S = 0
    for (let t = 0; t < x.length; t++) {
      const hi = t - lag - 1, lo = hi - window + 1
      if (lo < 0) { S = 0; continue }
      const base = x.slice(lo, hi + 1)
      const sigma = Math.max(sd(base), sigmaFloor) // floor: a flat or placeholder series must not explode the z-score
      S = Math.max(0, S + (mean(base) - x[t]) / sigma - k)
      if (S >= h) flags[t] = true
    }
  }
  return flags
}

const d4 = (opts) => (scores, weeks) => {
  const base = shippedDetector(scores)
  const c = cusumFlags(weeks, opts)
  return base.map((b, i) => b || c[i])
}

function evaluate(teams, signals, detector) {
  const series = teams.map((t) => scoreSeries(t, signals))
  const recs = teams.map((t, i) => evalTeam(detector(series[i], t.weeks, signals), t))
  return summarize(recs)
}
const pct = (x) => `${Math.round(x * 100)}%`
const row = (name, s) =>
  `| ${name} | ${pct(s.recall.p)} | ${pct(s.recallSubtle.p)} [${pct(s.recallSubtle.ci[0])}–${pct(s.recallSubtle.ci[1])}] | ${pct(s.recallClear.p)} | ${s.latency.median.toFixed(1)} | ${s.fa.rate.toFixed(3)} | ${pct(s.benignFire.p)} |`
const HEAD = '| Detector | Recall (all) | Subtle [95% CI] | Clear | Median latency (wks) | False alarms / team-month | Benign controls fired |\n| --- | --- | --- | --- | --- | --- | --- |'

if (!('final' in argv)) {
  // ---- DEV grid: choose parameters here, and only here ----
  const teams = buildDataset('dev', NOISES.mid)
  const out = [`### DEV grid (noise x1, all five signals)\n`, HEAD, row('D0 shipped (control)', evaluate(teams, 'full', (s) => shippedDetector(s)))]
  for (const k of [1.0, 1.5]) for (const h of [6, 8, 10, 12, 14]) {
    out.push(row(`D4 CUSUM k=${k} h=${h}`, evaluate(teams, 'full', d4({ k, h }))))
  }
  console.log(out.join('\n'))
} else {
  // ---- HELD-OUT, once, with the parameters chosen on DEV ----
  const k = Number(argv.k), h = Number(argv.h)
  const opts = { k, h }
  const out = [`## Per-signal change detection (priority #4) — HELD-OUT, parameters chosen on DEV: CUSUM k=${k}, h=${h}\n`]
  const held = buildDataset('heldout', NOISES.mid)
  out.push('### HELD-OUT, noise x1, all five signals\n', HEAD)
  out.push(row('D0 shipped (control)', evaluate(held, 'full', (s) => shippedDetector(s))))
  out.push(row('D4 shipped + per-signal CUSUM', evaluate(held, 'full', d4(opts))))
  out.push('\n### Sensitivity: weekly noise x data availability (recall / false alarms per team-month)\n', '| Noise | Data | D0 | D4 |', '| --- | --- | --- | --- |')
  for (const [nn, scale] of Object.entries(NOISES)) {
    const tt = buildDataset('heldout', scale)
    for (const sig of ['full', 'liveOnly']) {
      const a = evaluate(tt, sig, (s) => shippedDetector(s))
      const b = evaluate(tt, sig, d4({ ...opts, useGithub: sig === 'full' }))
      out.push(`| x${scale} | ${sig === 'full' ? 'all 5 signals' : 'live only (GitHub excluded)'} | ${pct(a.recall.p)} / ${a.fa.rate.toFixed(2)} | ${pct(b.recall.p)} / ${b.fa.rate.toFixed(2)} |`)
    }
  }
  const text = out.join('\n') + '\n'
  fs.mkdirSync(`${ROOT}eval/validation/after/`, { recursive: true })
  fs.writeFileSync(`${ROOT}eval/validation/after/persignal_heldout.md`, text)
  console.log(text)
}
