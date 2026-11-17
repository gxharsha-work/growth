// Fixed-window rate limiting for the coaching endpoint, backed by the
// rate_limits table (migration 0004). The AI call costs inference, so it's
// capped per user per hour and per team per day. Cloudflare's own rate-limit
// binding isn't used — it's not part of the free-tier setup in DEPLOY.md.

const USER_PER_HOUR = 10
const TEAM_PER_DAY = 30

type Env = { DB: D1Database; ENVIRONMENT?: string; DEV_AUTH_ROLE?: string }

async function bump(db: D1Database, key: string, window: string): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window, count) VALUES (?, ?, 1)
       ON CONFLICT (key, window) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(key, window)
    .first<{ count: number }>()
  return row?.count ?? 1
}

export type RateResult = { ok: true } | { ok: false; retryAfter: number; scope: 'user' | 'team' }

export async function checkCoachingRateLimit(
  env: Env,
  email: string,
  teamId: string
): Promise<RateResult> {
  // Local dev bypass stays unthrottled so testing isn't blocked.
  if (env.ENVIRONMENT !== 'production' && env.DEV_AUTH_ROLE) return { ok: true }

  const now = Date.now()
  const hour = Math.floor(now / 3_600_000)
  const day = Math.floor(now / 86_400_000)

  const userCount = await bump(env.DB, `user:${email}`, `h:${hour}`)
  if (userCount > USER_PER_HOUR) {
    return { ok: false, retryAfter: (hour + 1) * 3_600_000 - now, scope: 'user' }
  }

  const teamCount = await bump(env.DB, `team:${teamId}`, `d:${day}`)
  if (teamCount > TEAM_PER_DAY) {
    return { ok: false, retryAfter: (day + 1) * 86_400_000 - now, scope: 'team' }
  }

  return { ok: true }
}
