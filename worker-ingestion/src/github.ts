// GitHub ingestion (FR2): review turnaround and after-hours commit share per
// Jira sprint, counted ONLY for roster members who have opted in (FR18), and
// stored as team-level totals only (FR17): no logins, titles or messages.
//
// Definitions (per sprint window; an active sprint's window runs to now):
//   prCount                   PRs opened in the window by consented members
//   avgReviewTurnaroundHours  mean hours from PR opened to the first review by
//                             someone else; an unreviewed PR counts the time
//                             it has waited so far (to close/merge, or to now)
//   pctCommitsAfter7pm        share of consented members' commits on GITHUB_BRANCH
//                             (default main) made 19:00 to 05:59 in TEAM_TIMEZONE;
//                             merge commits and commits with an AI co-author
//                             trailer (Claude, Copilot, ChatGPT, Cursor...) are
//                             excluded, since their timing is not the member's
// A sprint needs at least one PR and one commit from consented members;
// otherwise it gets no GitHub row and the signal shows "No data".

import type { SprintMeta } from './jira'

export type GithubEnv = { GITHUB_REPO: string; GITHUB_TOKEN?: string; TEAM_TIMEZONE: string; GITHUB_BRANCH?: string }
export type GithubSignal = {
  prCount: number
  avgReviewTurnaroundHours: number
  pctCommitsAfter7pm: number
  sample: { commits: number; excludedAiCommits: number; reviewedPrs: number; waitingPrs: number }
}
export type GithubSprintResult = { sprint: SprintMeta; github: GithubSignal | null }

type Pull = { number: number; user: { login: string } | null; created_at: string; closed_at: string | null }
type Review = { user: { login: string } | null; submitted_at: string | null }
type Commit = { sha: string; author: { login: string } | null; parents?: unknown[]; commit: { author: { date: string }; message: string } }

// A Co-authored-by trailer naming an AI assistant (the message is read, never stored).
const AI_COAUTHOR = /^co-authored-by:.*(claude|anthropic|copilot|chatgpt|openai|cursor|gemini|codeium|windsurf)/im
export const isAiCoAuthored = (message: string) => AI_COAUTHOR.test(message ?? '')

const HOUR = 3_600_000

export function windowFor(sprint: SprintMeta, now: number): { start: number; end: number } | null {
  const start = Date.parse(sprint.startDate ?? '')
  if (!Number.isFinite(start)) return null
  const planned = Date.parse(sprint.endDate ?? '')
  const end = sprint.state === 'active' ? Math.max(now, Number.isFinite(planned) ? planned : now) : planned
  return Number.isFinite(end) ? { start, end } : null
}

export function isAfterHours(iso: string, timeZone: string): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)))
  return hour >= 19 || hour < 6
}

export async function runGithubIngestion(
  env: GithubEnv,
  sprints: SprintMeta[],
  consentedLogins: Set<string>,
  log: string[],
  now = Date.now()
): Promise<GithubSprintResult[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'growth-ingestion', 'X-GitHub-Api-Version': '2022-11-28' }
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
  log.push(`GitHub: ${env.GITHUB_TOKEN ? 'authenticated with GITHUB_TOKEN' : 'no GITHUB_TOKEN set, using the anonymous rate limit'}`)
  const api = async <T>(path: string): Promise<T> => {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, { headers })
    if (!res.ok) {
      // GitHub's own reason (for example a missing token permission); never the token.
      const reason = await res.json().then((b) => (b as { message?: string })?.message ?? '').catch(() => '')
      throw new Error(`GitHub request failed (${res.status}${reason ? `: ${reason}` : ''}) for ${path.split('?')[0]}`)
    }
    return res.json() as Promise<T>
  }
  const isConsented = (login: string | undefined) => !!login && consentedLogins.has(login.toLowerCase())

  if (consentedLogins.size === 0) {
    log.push('GitHub: no opted-in member has a GitHub login; no GitHub data written')
    return sprints.map((sprint) => ({ sprint, github: null }))
  }

  // PRs (newest first, up to 300), fetched once for all sprints.
  const pulls: Pull[] = []
  for (let page = 1; page <= 3; page++) {
    const batch = await api<Pull[]>(`/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`)
    pulls.push(...batch)
    if (batch.length < 100) break
  }
  const branch = env.GITHUB_BRANCH || 'main'

  const results: GithubSprintResult[] = []
  for (const sprint of sprints) {
    const w = windowFor(sprint, now)
    if (!w) { results.push({ sprint, github: null }); continue }

    // Review turnaround for consented members' PRs opened in the window.
    const hours: number[] = []
    let reviewed = 0
    for (const pr of pulls) {
      const opened = Date.parse(pr.created_at)
      if (opened < w.start || opened > w.end || !isConsented(pr.user?.login)) continue
      const reviews = await api<Review[]>(`/pulls/${pr.number}/reviews?per_page=100`)
      const first = reviews
        .filter((r) => r.submitted_at && r.user?.login !== pr.user?.login)
        .map((r) => Date.parse(r.submitted_at as string))
        .sort((a, b) => a - b)[0]
      if (first !== undefined) reviewed++
      const until = first ?? (pr.closed_at ? Date.parse(pr.closed_at) : now)
      hours.push((until - opened) / HOUR)
    }

    // After-hours share for consented members' own commits on the main branch.
    let commits = 0
    let late = 0
    let aiExcluded = 0
    const since = new Date(w.start).toISOString()
    const until = new Date(w.end).toISOString()
    for (let page = 1; page <= 5; page++) {
      const batch = await api<Commit[]>(`/commits?sha=${encodeURIComponent(branch)}&since=${since}&until=${until}&per_page=100&page=${page}`)
      for (const c of batch) {
        if (!isConsented(c.author?.login) || (c.parents?.length ?? 1) > 1) continue
        if (isAiCoAuthored(c.commit.message)) { aiExcluded++; continue }
        commits++
        if (isAfterHours(c.commit.author.date, env.TEAM_TIMEZONE)) late++
      }
      if (batch.length < 100) break
    }

    if (hours.length === 0 || commits === 0) {
      log.push(`GitHub sprint ${sprint.id}: ${hours.length} PRs, ${commits} commits from opted-in members on ${branch} (${aiExcluded} AI co-authored excluded); not enough for a GitHub signal`)
      results.push({ sprint, github: null })
      continue
    }
    const github: GithubSignal = {
      prCount: hours.length,
      avgReviewTurnaroundHours: Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10,
      pctCommitsAfter7pm: Math.round((100 * late) / commits),
      sample: { commits, excludedAiCommits: aiExcluded, reviewedPrs: reviewed, waitingPrs: hours.length - reviewed },
    }
    log.push(`GitHub sprint ${sprint.id}: ${github.prCount} PRs (${reviewed} reviewed), ${commits} commits from opted-in members on ${branch} (${aiExcluded} AI co-authored excluded)`)
    results.push({ sprint, github })
  }
  return results
}
