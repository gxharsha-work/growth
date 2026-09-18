// Pulls real signals from a live Jira Cloud project and writes them into
// src/data/jiraSignals.generated.json, where mockSignals.js merges them into
// WEEKLY_SIGNALS as the "solstice" team (see FR1 in the Sprint 2 doc).
//
// This must run in Node, not the browser: Jira Cloud needs a secret API
// token and blocks cross-origin browser requests. Run via:
//   npm run ingest:jira
//
// Only produces { week, jira: { issueCount, avgCycleTimeDays,
// sprintCompletionPct } } rows — no scoring math. healthScore.js /
// teamHealth.js consume that shape unchanged.

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

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

async function getActiveSprintId() {
  const data = await fetchJson(
    `/rest/agile/1.0/board/${BOARD_ID}/sprint?state=active`
  )
  const sprint = data.values?.[0]
  if (!sprint) throw new Error('No active sprint found on board ' + BOARD_ID)
  return sprint.id
}

async function getSprintIssues(sprintId) {
  const data = await fetchJson(
    `/rest/api/3/search/jql?jql=sprint=${sprintId}&fields=status,created&maxResults=100`
  )
  return data.issues
}

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
    if (!end || end < start) return null
    return { key: issueKey, days: (end - start) / 86400000, isProxy: false }
  }

  // Not done yet — usable as an "elapsed so far" proxy if it's in progress.
  if (start) {
    return {
      key: issueKey,
      days: (Date.now() - start) / 86400000,
      isProxy: true,
    }
  }
  return null
}

async function main() {
  const sprintId = await getActiveSprintId()
  const issues = await getSprintIssues(sprintId)

  const issueCount = issues.length
  const doneCount = issues.filter(
    (i) => i.fields.status.statusCategory.key === 'done'
  ).length
  const sprintCompletionPct = issueCount
    ? Math.round((100 * doneCount) / issueCount)
    : 0

  const cycleTimes = []
  for (const issue of issues) {
    const result = await computeCycleTimeDays(issue.key)
    if (result) cycleTimes.push(result)
  }

  const completedCycleTimes = cycleTimes.filter((c) => !c.isProxy)
  const usingProxy = completedCycleTimes.length === 0 && cycleTimes.length > 0
  const source = usingProxy ? cycleTimes : completedCycleTimes
  const avgCycleTimeDays = source.length
    ? Math.round((source.reduce((sum, c) => sum + c.days, 0) / source.length) * 10) / 10
    : 0

  if (usingProxy) {
    console.warn(
      '⚠ no completed issues in the active sprint yet — avgCycleTimeDays is an ' +
        'in-progress-elapsed-time proxy, not a true cycle time.'
    )
  }

  console.log('Per-issue cycle time diagnostics:')
  for (const c of cycleTimes) {
    console.log(
      `  ${c.key}: ${c.days.toFixed(2)}d${c.isProxy ? ' (proxy, still in progress)' : ''}`
    )
  }

  const isoWeek = getIsoWeek(new Date())

  let data = {}
  try {
    data = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'))
  } catch {
    // no file yet — start fresh
  }

  const teamWeeks = data[TEAM_ID] ?? []
  const lastRow = teamWeeks[teamWeeks.length - 1]
  const newRow = {
    week: lastRow && lastRow.isoWeek === isoWeek ? lastRow.week : (lastRow?.week ?? 0) + 1,
    isoWeek,
    jira: { issueCount, avgCycleTimeDays, sprintCompletionPct },
  }

  const updatedWeeks =
    lastRow && lastRow.isoWeek === isoWeek
      ? [...teamWeeks.slice(0, -1), newRow]
      : [...teamWeeks, newRow]

  data[TEAM_ID] = updatedWeeks

  await writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2) + '\n')

  console.log('\nSummary:')
  console.table([
    { team: TEAM_ID, week: newRow.week, isoWeek, issueCount, avgCycleTimeDays, sprintCompletionPct },
  ])
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
