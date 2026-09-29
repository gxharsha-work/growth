// Ported from scripts/jira-ingest.js, with two changes: it returns a
// result object instead of writing a file, and every `console.log` becomes
// a line pushed onto `log` so `wrangler tail` shows the same diagnostics
// the CLI script used to print (which issues counted, cycle-time
// inclusion/exclusion per issue, whether a proxy was used).

const IN_PROGRESS_CATEGORY_STATUS_IDS = ['10002', '10003'] // In Progress, Testing
const DONE_STATUS_ID = '10004'

export type JiraEnv = {
  JIRA_SITE_URL: string
  JIRA_EMAIL: string
  MY_ATLASSIAN_TOKEN: string
  JIRA_BOARD_ID: string
}

type CycleResult =
  | { key: string; include: true; days: number; isProxy: boolean }
  | { key: string; include: false; reason: string }

export async function runJiraIngestion(env: JiraEnv, log: string[]) {
  const authHeader = 'Basic ' + btoa(`${env.JIRA_EMAIL}:${env.MY_ATLASSIAN_TOKEN}`)

  async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${env.JIRA_SITE_URL}${path}`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`Jira request failed (${res.status}) for ${path}: ${await res.text()}`)
    }
    return res.json()
  }

  const sprintData = await fetchJson<{ values: { id: number }[] }>(
    `/rest/agile/1.0/board/${env.JIRA_BOARD_ID}/sprint?state=active`
  )
  const sprint = sprintData.values?.[0]
  if (!sprint) throw new Error(`No active sprint found on board ${env.JIRA_BOARD_ID}`)

  const searchData = await fetchJson<{
    issues: {
      key: string
      fields: { summary: string; created: string; status: { name: string; statusCategory: { key: string } } }
    }[]
  }>(`/rest/api/3/search/jql?jql=sprint=${sprint.id}&fields=status,created,summary&maxResults=100`)
  const issues = searchData.issues

  const issueCount = issues.length
  const doneCount = issues.filter((i) => i.fields.status.statusCategory.key === 'done').length
  const sprintCompletionPct = issueCount ? Math.round((100 * doneCount) / issueCount) : 0

  log.push(`Sprint ${sprint.id}: ${issueCount} issues, ${doneCount} counted as done`)

  async function computeCycleTimeDays(issueKey: string): Promise<CycleResult> {
    const issue = await fetchJson<{
      fields: { status: { statusCategory: { key: string }; name: string }; created: string }
      changelog?: { histories: { created: string; items: { field: string; to: string }[] }[] }
    }>(`/rest/api/3/issue/${issueKey}?expand=changelog&fields=status,created`)

    let start: Date | null = null
    let end: Date | null = null
    for (const history of issue.changelog?.histories ?? []) {
      const statusChange = history.items.find((item) => item.field === 'status')
      if (!statusChange) continue
      const ts = new Date(history.created)
      if (!start && IN_PROGRESS_CATEGORY_STATUS_IDS.includes(statusChange.to)) start = ts
      if (statusChange.to === DONE_STATUS_ID) end = ts
    }

    const isDone = issue.fields.status.statusCategory.key === 'done'
    if (isDone) {
      if (!start) start = new Date(issue.fields.created)
      if (!end || end < start) {
        return { key: issueKey, include: false, reason: 'marked Done but no Done transition found in changelog' }
      }
      return { key: issueKey, include: true, days: (end.getTime() - start.getTime()) / 86400000, isProxy: false }
    }
    if (start) {
      return { key: issueKey, include: true, days: (Date.now() - start.getTime()) / 86400000, isProxy: true }
    }
    return { key: issueKey, include: false, reason: 'never entered In Progress/Testing' }
  }

  const cycleResults: CycleResult[] = []
  for (const issue of issues) cycleResults.push(await computeCycleTimeDays(issue.key))
  const cycleTimes = cycleResults.filter((r): r is Extract<CycleResult, { include: true }> => r.include)

  const details = issues.map((issue) => {
    const cycle = cycleResults.find((r) => r.key === issue.key)!
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

  if (usingProxy) log.push('no completed issues in the active sprint yet — avgCycleTimeDays is an in-progress-elapsed-time proxy')

  return { issueCount, avgCycleTimeDays, sprintCompletionPct, details }
}
