// Pulls real signals from a live Jira Cloud project and writes them into
// src/data/jiraSignals.generated.json, where mockSignals.js merges them into
// WEEKLY_SIGNALS as the "solstice" team (see FR1 in the Sprint 2 doc).
//
// This must run in Node, not the browser: Jira Cloud needs a secret API
// token and blocks cross-origin browser requests. Run via:
//   npm run ingest:jira
//
// Produces one row per real sprint, aligned to the sprint's own boundaries:
//   { week, sprint: { id, name, state, startDate, endDate },
//     jira: { issueCount, avgCycleTimeDays, sprintCompletionPct, details } }
// No scoring math here. mockSignals.js folds the weekly calendar rows into
// each sprint window (see sprintAlign.js); healthScore.js is unchanged.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const TEAM_ID = 'solstice'
const BOARD_ID = 1
const IN_PROGRESS_CATEGORY_STATUS_IDS = ['10002', '10003'] // In Progress, Testing
const DONE_STATUS_ID = '10004'

const OUTPUT_PATH = fileURLToPath(
  new URL('../src/data/jiraSignals.generated.json', import.meta.url)
)

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`
    )
  }
  return value
}

const SITE_URL = requireEnv('JIRA_SITE_URL')
const EMAIL = requireEnv('JIRA_EMAIL')
const TOKEN = requireEnv('MY_ATLASSIAN_TOKEN')

const AUTH_HEADER =
  'Basic ' + Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')

async function fetchJson(path) {
  const res = await fetch(`${SITE_URL}${path}`, {
    headers: { Authorization: AUTH_HEADER, Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Jira request failed (${res.status}) for ${path}: ${body}`)
  }
  return res.json()
}

// Every sprint on the board with real boundaries (closed + active), oldest
// first. Metrics are then computed per sprint and aligned to these windows —
// instead of the old behaviour of pulling only the active sprint and stamping
// it with whatever ISO calendar week the script happened to run in.
async function getAllSprints() {
  const sprints = []
  let startAt = 0
  for (;;) {
    const data = await fetchJson(
      `/rest/agile/1.0/board/${BOARD_ID}/sprint?state=closed,active&startAt=${startAt}&maxResults=50`
    )
    for (const s of data.values ?? []) {
      sprints.push({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate ?? null,
        endDate: s.endDate ?? null,
        completeDate: s.completeDate ?? null,
      })
    }
    if (data.isLast || !(data.values?.length)) break
    startAt += data.values.length
  }
  if (!sprints.length) throw new Error('No sprints found on board ' + BOARD_ID)
  // Sort by start date so the emitted rows read oldest -> newest.
  sprints.sort((a, b) => Date.parse(a.startDate ?? 0) - Date.parse(b.startDate ?? 0))
  return sprints
}

async function getSprintIssues(sprintId) {
  const data = await fetchJson(
    `/rest/api/3/search/jql?jql=sprint=${sprintId}&fields=status,created,summary&maxResults=100`
  )
  return data.issues
}

// Always returns a diagnostic result — { include: false, reason } when the
// issue doesn't contribute a cycle time, so callers can show every issue's
// fate, not just the ones that made it into the average (mirrors the
// google-calendar-ingest.js ✓/✗ pattern).
async function computeCycleTimeDays(issueKey) {
  const issue = await fetchJson(
    `/rest/api/3/issue/${issueKey}?expand=changelog&fields=status,created`
  )

  let start = null
  let end = null
  for (const history of issue.changelog?.histories ?? []) {
    const statusChange = history.items.find((item) => item.field === 'status')
    if (!statusChange) continue
    const ts = new Date(history.created)
    if (!start && IN_PROGRESS_CATEGORY_STATUS_IDS.includes(statusChange.to)) {
      start = ts
    }
    if (statusChange.to === DONE_STATUS_ID) {
      end = ts // keep the last one — handles reopen/redo/done
    }
  }

  const isDone = issue.fields.status.statusCategory.key === 'done'
  if (isDone) {
    if (!start) start = new Date(issue.fields.created)
    if (!end || end < start) {
      return { key: issueKey, include: false, reason: 'marked Done but no Done transition found in changelog' }
    }
    return { key: issueKey, include: true, days: (end - start) / 86400000, isProxy: false }
  }

  // Not done yet — usable as an "elapsed so far" proxy if it's in progress.
  if (start) {
    return {
      key: issueKey,
      include: true,
      days: (Date.now() - start) / 86400000,
      isProxy: true,
    }
  }
  return { key: issueKey, include: false, reason: 'never entered In Progress/Testing' }
}

// Aggregate one sprint's issues into the { issueCount, avgCycleTimeDays,
// sprintCompletionPct, details } shape the app consumes. `active` only affects
// the diagnostic wording (an active sprint's completion is a mid-flight
// snapshot; a closed sprint's is final).
async function computeSprintJira(sprint, issues) {
  const issueCount = issues.length
  const doneCount = issues.filter(
    (i) => i.fields.status.statusCategory.key === 'done'
  ).length
  const sprintCompletionPct = issueCount
    ? Math.round((100 * doneCount) / issueCount)
    : 0

  console.log(
    `\nSprint ${sprint.id} "${sprint.name}" [${sprint.state}] ` +
      `${sprint.startDate?.slice(0, 10) ?? '?'}→${sprint.endDate?.slice(0, 10) ?? '?'} ` +
      `(${issueCount} issues, ${doneCount} done):`
  )
  for (const issue of issues) {
    const done = issue.fields.status.statusCategory.key === 'done'
    console.log(
      `  ${issue.key} "${issue.fields.summary}" — ${issue.fields.status.name}` +
        (done ? ' ✓' : '')
    )
  }

  const cycleResults = []
  for (const issue of issues) {
    cycleResults.push(await computeCycleTimeDays(issue.key))
  }
  const cycleTimes = cycleResults.filter((r) => r.include)

  // Per-issue breakdown, persisted alongside the aggregates so the UI can show
  // exactly which issues fed a sprint's numbers (not just the final averages).
  const details = issues.map((issue) => {
    const cycle = cycleResults.find((r) => r.key === issue.key)
    return {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      countsAsDone: issue.fields.status.statusCategory.key === 'done',
      cycleTimeDays: cycle.include ? Math.round(cycle.days * 100) / 100 : null,
      isProxy: cycle.include ? cycle.isProxy : null,
      excludedReason: cycle.include ? null : cycle.reason,
    }
  })

  const completedCycleTimes = cycleTimes.filter((c) => !c.isProxy)
  const usingProxy = completedCycleTimes.length === 0 && cycleTimes.length > 0
  const source = usingProxy ? cycleTimes : completedCycleTimes
  const avgCycleTimeDays = source.length
    ? Math.round((source.reduce((sum, c) => sum + c.days, 0) / source.length) * 10) / 10
    : 0

  if (usingProxy && sprint.state === 'active') {
    console.warn(
      '  ⚠ no completed issues yet — avgCycleTimeDays is an in-progress-elapsed ' +
        'proxy, not a true cycle time.'
    )
  }

  return { issueCount, avgCycleTimeDays, sprintCompletionPct, details }
}

async function main() {
  const sprints = await getAllSprints()

  const rows = []
  for (const [i, sprint] of sprints.entries()) {
    const issues = await getSprintIssues(sprint.id)
    const jira = await computeSprintJira(sprint, issues)
    rows.push({
      week: i + 1,
      sprint: {
        id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
      },
      jira,
    })
  }

  let data = {}
  try {
    data = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'))
  } catch {
    // no file yet — start fresh
  }

  // Full backfill: we pull every sprint each run, so replace the team's rows
  // rather than appending (no drift, re-runnable, idempotent).
  data[TEAM_ID] = rows

  await writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2) + '\n')

  console.log('\nSummary (one row per sprint, aligned to sprint boundaries):')
  console.table(
    rows.map((r) => ({
      team: TEAM_ID,
      sprint: r.sprint.name,
      state: r.sprint.state,
      issues: r.jira.issueCount,
      avgCycleTimeDays: r.jira.avgCycleTimeDays,
      sprintCompletionPct: r.jira.sprintCompletionPct,
    }))
  )
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
