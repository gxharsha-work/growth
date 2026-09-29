// Sprint 5 evaluation script: reproduces the Sprint 3 baseline results
// table from the live deployed scoring logic (confirming the deterministic
// baseline is unchanged), then exercises the new AI coaching layer
// (functions/api/_lib/coaching.ts, POST /api/insight) across the weeks
// that matter most — Backend Team's documented week-6-through-8 decline,
// and a stable Platform Team week as a control — recording every input/
// output pair for EVALUATION.md.
//
// Run via: node scripts/evaluate-coaching.mjs [base-url]
// (defaults to the deployed preview URL)

import { computeHealthScore, isEarlyWarning } from '../src/logic/healthScore.js'

const BASE = process.argv[2] ?? 'https://feature-cloudflare-backend.growth-3it.pages.dev'

const COHORTS = {
  platform: { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' },
  backend: { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' },
}

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}

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

async function getInsight(evidence) {
  const res = await fetch(`${BASE}/api/insight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(evidence),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `insight request failed (${res.status})`)
  return body.text
}

async function main() {
  const [platform, backend] = await Promise.all([
    getJSON('/api/teams/platform/signals'),
    getJSON('/api/teams/backend/signals'),
  ])

  const rows = { platform: platform.weeks, backend: backend.weeks }
  const scores = { platform: [], backend: [] }
  for (const id of ['platform', 'backend']) {
    scores[id] = rows[id].map(computeHealthScore)
  }

  console.log('\n=== Reproduced baseline table (Assignment 3 deterministic scoring) ===\n')
  console.log('Week | Platform Score | Platform Status | Backend Score | Backend Status')
  const table = []
  for (let i = 0; i < 8; i++) {
    const pWarn = isEarlyWarning(scores.platform, i)
    const bWarn = isEarlyWarning(scores.backend, i)
    const row = {
      week: i + 1,
      platformScore: scores.platform[i],
      platformStatus: pWarn ? 'Early Warning' : 'Healthy',
      backendScore: scores.backend[i],
      backendStatus: bWarn ? 'Early Warning' : 'Healthy',
    }
    table.push(row)
    console.log(
      `${row.week}    | ${row.platformScore}              | ${row.platformStatus}          | ${row.backendScore}             | ${row.backendStatus}`
    )
  }

  console.log('\n=== AI coaching layer: Backend Team, week 8 (Early Warning) ===\n')
  const backendWeek8 = rows.backend[7]
  const platformWeek8 = rows.platform[7]
  const backendEvidence = {
    team: { name: 'Backend Team', cohort: COHORTS.backend },
    week: 8,
    score: scores.backend[7],
    trend: scores.backend[7] - scores.backend[6],
    earlyWarning: isEarlyWarning(scores.backend, 7),
    signals: evidenceSignals(backendWeek8),
    peer: { name: 'Platform Team', score: scores.platform[7], signals: evidenceSignals(platformWeek8) },
  }
  const backendNote = await getInsight(backendEvidence)
  console.log(backendNote)

  console.log('\n=== AI coaching layer: Platform Team, week 8 (Healthy, control case) ===\n')
  const platformEvidence = {
    team: { name: 'Platform Team', cohort: COHORTS.platform },
    week: 8,
    score: scores.platform[7],
    trend: scores.platform[7] - scores.platform[6],
    earlyWarning: isEarlyWarning(scores.platform, 7),
    signals: evidenceSignals(platformWeek8),
    peer: { name: 'Backend Team', score: scores.backend[7], signals: evidenceSignals(backendWeek8) },
  }
  const platformNote = await getInsight(platformEvidence)
  console.log(platformNote)

  console.log('\nDone. Copy the table + notes above into EVALUATION.md if they changed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
