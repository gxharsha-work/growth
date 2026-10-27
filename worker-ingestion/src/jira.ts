// Ported from scripts/jira-ingest.js, with two changes: it returns result
// objects instead of writing a file, and every `console.log` becomes a line
// pushed onto `log` so `wrangler tail` shows the same diagnostics the CLI
// script used to print (which issues counted, cycle-time inclusion/exclusion
// per issue, whether a proxy was used).
//
// Metrics are aligned to sprint boundaries: it pulls every sprint on the board
// (closed + active) and returns one result per sprint, each carrying the
// sprint's own id/name/state/start/end. index.ts keys each row by the sprint's
// start ISO week, so repeated daily runs within a sprint overwrite that one
// sprint's row rather than scattering mid-sprint snapshots across calendar weeks.

const IN_PROGRESS_CATEGORY_STATUS_IDS = ['10002', '10003'] // In Progress, Testing
const DONE_STATUS_ID = '10004'

export type JiraEnv = {
  JIRA_SITE_URL: string
  JIRA_EMAIL: string
  MY_ATLASSIAN_TOKEN: string
  JIRA_BOARD_ID: string
}

export type SprintMeta = { id: number; name: string; state: string; startDate: string | null; endDate: string | null }
export type JiraSprintResult = {
  sprint: SprintMeta
  jira: { issueCount: number; avgCycleTimeDays: number; sprintCompletionPct: number; details: unknown[] }
}

type CycleResult =
  | { key: string; include: true; days: number; isProxy: boolean }
  | { key: string; include: false; reason: string }

export async function runJiraIngestion(env: JiraEnv, log: string[]): Promise<JiraSprintResult[]> {
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

  async function getAllSprints(): Promise<SprintMeta[]> {
    const sprints: SprintMeta[] = []
    let startAt = 0
    for (;;) {
      const data = await fetchJson<{
        isLast?: boolean
        values: { id: number; name: string; state: string; startDate?: string; endDate?: string }[]
      }>(`/rest/agile/1.0/board/${env.JIRA_BOARD_ID}/sprint?state=closed,active&startAt=${startAt}&maxResults=50`)
      for (const s of data.values ?? []) {
        sprints.push({ id: s.id, name: s.name, state: s.state, startDate: s.startDate ?? null, endDate: s.endDate ?? null })
      }
      if (data.isLast || !data.values?.length) break
      startAt += data.values.length
    }
    if (!sprints.length) throw new Error(`No sprints found on board ${env.JIRA_BOARD_ID}`)
    sprints.sort((a, b) => Date.parse(a.startDate ?? '0') - Date.parse(b.startDate ?? '0'))
    return sprints
  }

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

  async function computeSprintJira(sprint: SprintMeta): Promise<JiraSprintResult> {
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

    log.push(`Sprint ${sprint.id} "${sprint.name}" [${sprint.state}]: ${issueCount} issues, ${doneCount} done`)

    const cycleResults: CycleResult[] = []
    for (const issue of issues) cycleResults.push(await computeCycleTimeDays(issue.key))
    const cycleTimes = cycleResults.filter((r): r is Extract<CycleResult, { include: true }> => r.include)

    const details = issues.map((issue) => {
      const cycle = cycleResults.find((r) => r.key === issue.key)!
      return {
        key: issue.key,
        // The ticket summary is deliberately not stored (FR17: team-level aggregates only).
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
      log.push(`Sprint ${sprint.id}: no completed issues yet — avgCycleTimeDays is an in-progress-elapsed proxy`)
    }

    return { sprint, jira: { issueCount, avgCycleTimeDays, sprintCompletionPct, details } }
  }

  const sprints = await getAllSprints()
  const results: JiraSprintResult[] = []
  for (const sprint of sprints) results.push(await computeSprintJira(sprint))
  return results
}
