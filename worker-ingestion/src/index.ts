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
import { runJiraIngestion, type JiraEnv } from './jira'
import { runCalendarIngestion, type CalendarEnv } from './calendar'
import { getIsoWeek } from './isoWeek'

export type Env = JiraEnv & CalendarEnv & { DB: D1Database; PILOT_TEAM_ID: string }

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

async function ingest(env: Env): Promise<string[]> {
  const log: string[] = []
  const isoWeek = getIsoWeek(new Date())
  const teamId = env.PILOT_TEAM_ID

  try {
    const jira = await runJiraIngestion(env, log)
    await upsertSignalWeek(env.DB, teamId, isoWeek, 'jira', jira)
    log.push(`✓ jira signals written for ${teamId} ${isoWeek}`)
  } catch (err) {
    log.push(`✗ jira ingestion failed: ${(err as Error).message}`)
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

  // Manual trigger for testing after deploy: GET the Worker's own URL.
  // Not linked from the app anywhere — a convenience for `curl`/browser
  // during setup, same information a `wrangler tail` during the real cron
  // fire would show.
  async fetch(_request: Request, env: Env) {
    const log = await ingest(env)
    return new Response(log.join('\n') + '\n', { headers: { 'content-type': 'text/plain' } })
  },
}
