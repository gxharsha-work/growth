// Growth's ingestion Worker: runs on a daily Cron Trigger (see
// wrangler.toml) and replaces the old local `npm run ingest:jira` /
// `npm run ingest:calendar` workflow — same logic, but writing into the
// shared D1 database instead of committed JSON files, so every deployed
// viewer sees the refreshed signals without anyone running a script by hand.
//
// Single-tenant for now: PILOT_TEAM_ID is the one team both integrations
// are configured for (today: 'solstice'). Each source is best-effort and
// independent — a Jira outage shouldn't block writing the calendar row, or
// vice versa — matching the architecture doc's "degrade gracefully, don't
// fail the whole pipeline over one source" principle.
import { runJiraIngestion, type JiraEnv, type SprintMeta } from './jira'
import { runCalendarIngestion, type CalendarEnv } from './calendar'
import { runGithubIngestion, type GithubEnv } from './github'
import { getIsoWeek } from './isoWeek'

export type Env = JiraEnv & CalendarEnv & GithubEnv & { DB: D1Database; PILOT_TEAM_ID: string }

async function upsertSignalWeek(db: D1Database, teamId: string, isoWeek: string, source: string, payload: unknown) {
  await db
    .prepare(
      `INSERT INTO signal_weeks (team_id, iso_week, source, payload, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (team_id, iso_week, source)
       DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
    )
    .bind(teamId, isoWeek, source, JSON.stringify(payload), Date.now())
    .run()
}

async function recordStatus(db: D1Database, teamId: string, source: string, status: 'ok' | 'error', detail: string) {
  await db
    .prepare(
      `INSERT INTO ingestion_status (team_id, source, status, detail, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (team_id, source) DO UPDATE SET status = excluded.status, detail = excluded.detail, updated_at = excluded.updated_at`
    )
    .bind(teamId, source, status, detail, Date.now())
    .run()
}

async function ingest(env: Env): Promise<string[]> {
  const log: string[] = []
  const isoWeek = getIsoWeek(new Date())
  const teamId = env.PILOT_TEAM_ID
  let sprints: SprintMeta[] = []

  try {
    // One row per sprint, keyed by the sprint's start ISO week so daily re-runs
    // overwrite that sprint's row (boundary-aligned) instead of scattering
    // mid-sprint snapshots across whichever week the cron fired in. The sprint
    // metadata rides in the payload; signals.ts reads it to fold calendar weeks
    // into each sprint window.
    const sprintResults = await runJiraIngestion(env, log)
    for (const { sprint, jira } of sprintResults) {
      const sprintWeek = sprint.startDate ? getIsoWeek(new Date(sprint.startDate)) : isoWeek
      await upsertSignalWeek(env.DB, teamId, sprintWeek, 'jira', { ...jira, sprint })
    }
    log.push(`✓ jira signals written for ${teamId}: ${sprintResults.length} sprint(s)`)
    sprints = sprintResults.map((r) => r.sprint)
  } catch (err) {
    log.push(`✗ jira ingestion failed: ${(err as Error).message}`)
  }

  // GitHub per Jira sprint, opted-in members only (FR2, FR18). A sprint
  // without enough opted-in activity has its GitHub row removed, so a
  // withdrawal takes effect on the next run.
  if (sprints.length) {
    try {
      const { results } = await env.DB.prepare('SELECT github_logins FROM roster_members WHERE team_id = ? AND consented = 1')
        .bind(teamId)
        .all<{ github_logins: string }>()
      const logins = new Set(
        (results ?? []).flatMap((r) => r.github_logins.split(',')).map((l) => l.trim().toLowerCase()).filter(Boolean)
      )
      const githubResults = await runGithubIngestion(env, sprints, logins, log)
      let written = 0
      for (const { sprint, github } of githubResults) {
        const sprintWeek = sprint.startDate ? getIsoWeek(new Date(sprint.startDate)) : isoWeek
        if (github) {
          await upsertSignalWeek(env.DB, teamId, sprintWeek, 'github', { ...github, sprint })
          written++
        } else {
          await env.DB.prepare("DELETE FROM signal_weeks WHERE team_id = ? AND iso_week = ? AND source = 'github'").bind(teamId, sprintWeek).run()
        }
      }
      log.push(`✓ github signals written for ${teamId}: ${written} of ${githubResults.length} sprint(s)`)
      await recordStatus(env.DB, teamId, 'github', 'ok', `${written} of ${githubResults.length} sprints qualify`)
    } catch (err) {
      log.push(`✗ github ingestion failed: ${(err as Error).message}`)
      await recordStatus(env.DB, teamId, 'github', 'error', 'sync failed').catch(() => {})
    }
  }

  try {
    const calendar = await runCalendarIngestion(env, log)
    await upsertSignalWeek(env.DB, teamId, isoWeek, 'calendar', calendar)
    log.push(`✓ calendar signals written for ${teamId} ${isoWeek}`)
  } catch (err) {
    log.push(`✗ calendar ingestion failed: ${(err as Error).message}`)
  }

  return log
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      ingest(env).then((log) => {
        for (const line of log) console.log(line)
      })
    )
  },

  // Manual trigger. No public URL (workers_dev = false): reachable only via
  // the Pages project's INGEST service binding, which the API exposes to
  // admins as POST /api/admin/refresh, and via `wrangler dev` locally.
  async fetch(_request: Request, env: Env) {
    const log = await ingest(env)
    return new Response(log.join('\n') + '\n', { headers: { 'content-type': 'text/plain' } })
  },
}
