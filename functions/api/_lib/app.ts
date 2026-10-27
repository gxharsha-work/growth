// REST API for Growth, served at /api/* by Cloudflare Pages Functions
// (functions/api/[[path]].ts mounts this). Same-origin with the frontend,
// so no CORS is needed in production; local dev via `wrangler pages dev`
// serves both from the same port too.
//
// D1 is the single shared source of truth for teams and buildings — this
// replaces per-browser localStorage (teamsStore/villageStore's old
// `persist` middleware) so every viewer sees the same live village.
// Signals stay read-only here: worker-ingestion writes them on a schedule,
// this API only reads and merges (see _lib/signals.ts).

import { Hono } from 'hono'
import { getSignalsForTeam } from './signals'
import { generateCoachingNote, buildPrompt, type CoachingEvidence } from './coaching'
import { buildEvidence } from './evidence'
import { resolveUser, type AuthEnv, type AuthedUser } from './auth'
import { checkCoachingRateLimit } from './ratelimit'

type Env = AuthEnv & { AI: Ai; AI_TIMEOUT_MS?: string }
type Vars = { user: AuthedUser }

type TeamRow = {
  id: string
  name: string
  size_bucket: string
  function_type: string
  capabilities: string
  created_at: number
}

type BuildingRow = {
  id: string
  team_id: string
  name: string
  archetype: string
  notes: string
  col: number
  row: number
}

function serializeTeam(row: TeamRow) {
  return {
    id: row.id,
    name: row.name,
    cohort: { sizeBucket: row.size_bucket, functionType: row.function_type },
    capabilities: JSON.parse(row.capabilities),
    createdAt: row.created_at,
  }
}

function serializeBuilding(row: BuildingRow) {
  return {
    id: row.id,
    name: row.name,
    archetype: row.archetype,
    notes: row.notes,
    col: row.col,
    row: row.row,
  }
}

function slugify(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'team'
  )
}

let idCounter = 0
function makeId(prefix: string) {
  idCounter += 1
  return `${prefix}${Date.now().toString(36)}${idCounter}`
}

const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api')

// Field limits: the frontend caps these, the API must too (a client is not the only caller).
const MAX_NAME = 80
const MAX_SHORT = 60
const MAX_NOTES = 2000

// Every failure is a JSON body, never an HTML page or a stack trace.
app.onError((err, c) => {
  if (err instanceof SyntaxError) return c.json({ error: 'invalid JSON body' }, 400)
  console.error('unhandled API error', err)
  return c.json({ error: 'internal error' }, 500)
})

// Dev/eval tool: hidden entirely in production (404 before auth, so it is not even discoverable).
app.use('/eval/*', async (c, next) => {
  if (c.env.ENVIRONMENT === 'production') return c.json({ error: 'not found' }, 404)
  await next()
})

// Every route needs an authenticated, role-assigned user. Writes and the AI
// call require 'manager'; 'leadership' is read-only.
app.use('*', async (c, next) => {
  const { user, unauthenticated, unavailable } = await resolveUser(c.req.raw.headers, c.env)
  if (unavailable) return c.json({ error: 'authentication service unavailable' }, 503)
  if (unauthenticated) return c.json({ error: 'not signed in' }, 401)
  if (!user) return c.json({ error: 'not allowed: no role assigned' }, 403)

  const isWrite = c.req.method !== 'GET'
  const needsManager = isWrite || c.req.path.endsWith('/insight')
  if (needsManager && user.role !== 'manager') {
    return c.json({ error: 'manager role required' }, 403)
  }

  c.set('user', user)
  await next()
})

app.get('/me', (c) => c.json(c.get('user')))

// ---------- teams ----------

app.get('/teams', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM teams ORDER BY created_at ASC').all<TeamRow>()
  return c.json((results ?? []).map(serializeTeam))
})

app.post('/teams', async (c) => {
  const body = await c.req.json<{ name?: string; sizeBucket?: string; functionType?: string }>()
  const name = (body.name ?? '').trim()
  if (!name) return c.json({ error: 'name is required' }, 400)
  if (name.length > MAX_NAME) return c.json({ error: `name is too long (max ${MAX_NAME})` }, 400)
  if ((body.sizeBucket ?? '').length > MAX_SHORT || (body.functionType ?? '').length > MAX_SHORT) {
    return c.json({ error: `sizeBucket and functionType are limited to ${MAX_SHORT} characters` }, 400)
  }

  const { results } = await c.env.DB.prepare('SELECT id FROM teams').all<{ id: string }>()
  const existing = new Set((results ?? []).map((r) => r.id))
  const base = slugify(name)
  let id = base
  let n = 2
  while (existing.has(id)) {
    id = `${base}-${n}`
    n += 1
  }

  const createdAt = Date.now()
  const sizeBucket = body.sizeBucket?.trim() || 'Unspecified'
  const functionType = body.functionType?.trim() || 'Unspecified'
  await c.env.DB.prepare(
    'INSERT INTO teams (id, name, size_bucket, function_type, capabilities, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, name, sizeBucket, functionType, '[]', createdAt)
    .run()

  return c.json(
    serializeTeam({ id, name, size_bucket: sizeBucket, function_type: functionType, capabilities: '[]', created_at: createdAt }),
    201
  )
})

app.patch('/teams/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ name?: string; sizeBucket?: string; functionType?: string; capabilities?: string[] }>()

  const row = await c.env.DB.prepare('SELECT * FROM teams WHERE id = ?').bind(id).first<TeamRow>()
  if (!row) return c.json({ error: 'team not found' }, 404)
  if ((body.name ?? '').length > MAX_NAME || (body.sizeBucket ?? '').length > MAX_SHORT || (body.functionType ?? '').length > MAX_SHORT) {
    return c.json({ error: 'a field is too long' }, 400)
  }

  const name = body.name?.trim() || row.name
  const sizeBucket = body.sizeBucket?.trim() || row.size_bucket
  const functionType = body.functionType?.trim() || row.function_type
  const capabilities = body.capabilities !== undefined ? JSON.stringify(body.capabilities) : row.capabilities

  await c.env.DB.prepare(
    'UPDATE teams SET name = ?, size_bucket = ?, function_type = ?, capabilities = ? WHERE id = ?'
  )
    .bind(name, sizeBucket, functionType, capabilities, id)
    .run()

  return c.json(serializeTeam({ ...row, name, size_bucket: sizeBucket, function_type: functionType, capabilities }))
})

app.delete('/teams/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(id).run()
  // buildings cascade via the FK; signal_weeks too (harmless if there are none)
  return c.json({ ok: true })
})

// ---------- buildings ----------

app.get('/teams/:id/buildings', async (c) => {
  const teamId = c.req.param('id')
  const { results } = await c.env.DB.prepare('SELECT * FROM buildings WHERE team_id = ?').bind(teamId).all<BuildingRow>()
  return c.json((results ?? []).map(serializeBuilding))
})

app.post('/teams/:id/buildings', async (c) => {
  const teamId = c.req.param('id')
  const body = await c.req.json<{ name: string; archetype: string; col: number; row: number }>()
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400)
  if (body.name.length > MAX_NAME) return c.json({ error: `name is too long (max ${MAX_NAME})` }, 400)

  const id = makeId('b')
  await c.env.DB.prepare(
    'INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(id, teamId, body.name.trim(), body.archetype, '', body.col, body.row, Date.now())
    .run()

  return c.json(serializeBuilding({ id, team_id: teamId, name: body.name.trim(), archetype: body.archetype, notes: '', col: body.col, row: body.row }), 201)
})

app.patch('/buildings/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{ name?: string; notes?: string; archetype?: string; col?: number; row?: number }>()

  const row = await c.env.DB.prepare('SELECT * FROM buildings WHERE id = ?').bind(id).first<BuildingRow>()
  if (!row) return c.json({ error: 'building not found' }, 404)
  if ((body.name ?? '').length > MAX_NAME || (body.notes ?? '').length > MAX_NOTES) {
    return c.json({ error: 'a field is too long' }, 400)
  }

  const next = {
    name: body.name ?? row.name,
    notes: body.notes ?? row.notes,
    archetype: body.archetype ?? row.archetype,
    col: body.col ?? row.col,
    row: body.row ?? row.row,
  }
  await c.env.DB.prepare('UPDATE buildings SET name = ?, notes = ?, archetype = ?, col = ?, row = ?, updated_at = ? WHERE id = ?')
    .bind(next.name, next.notes, next.archetype, next.col, next.row, Date.now(), id)
    .run()

  return c.json(serializeBuilding({ ...row, ...next }))
})

app.delete('/buildings/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM buildings WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ---------- signals ----------

// Raw per-ticket and per-event breakdowns (summaries, event titles) never leave
// the server — only the aggregate numbers the scorer uses.
app.get('/teams/:id/signals', async (c) => {
  const teamId = c.req.param('id')
  const { weeks, source } = await getSignalsForTeam(c.env.DB, teamId)
  const aggregated = weeks.map((w) => ({
    ...w,
    jira: { issueCount: w.jira.issueCount, avgCycleTimeDays: w.jira.avgCycleTimeDays, sprintCompletionPct: w.jira.sprintCompletionPct },
    calendar: { avgMeetingHoursPerWeek: w.calendar.avgMeetingHoursPerWeek },
  }))
  return c.json({ weeks: aggregated, source })
})

// ---------- AI coaching (Sprint 3's stage 5 — see _lib/coaching.ts) ----------

// The client names only the team and week. Score, trend, signals, and the
// peer are all computed here, so the model is always given server-verified
// evidence (see _lib/evidence.ts).
app.post('/insight', async (c) => {
  const body = await c.req.json<{ teamId?: string; week?: number }>()
  if (!body?.teamId || !Number.isInteger(body.week)) {
    return c.json({ error: 'teamId and week are required' }, 400)
  }

  const limit = await checkCoachingRateLimit(c.env, c.get('user').email, body.teamId)
  if (!limit.ok) {
    const seconds = Math.ceil(limit.retryAfter / 1000)
    return c.json(
      { error: `rate limit reached (${limit.scope}); try again later` },
      429,
      { 'Retry-After': String(seconds) }
    )
  }

  const built = await buildEvidence(c.env.DB, body.teamId, body.week as number)
  if (!built) return c.json({ error: 'unknown team or week' }, 404)

  // Coaching needs real ingested data. Hand-tuned demo teams and generated
  // teams would have the AI narrate fabricated history (report §3.2), so only
  // a team with live Jira signal is eligible.
  if (built.source !== 'live') {
    return c.json({ error: 'demo_data' }, 403)
  }

  try {
    const note = await generateCoachingNote(c.env.AI, built.evidence, Number(c.env.AI_TIMEOUT_MS) || 8000)
    return c.json({ ...note, dataSource: built.source })
  } catch (err) {
    // The AI layer is an enhancement, never a dependency (Sprint 3/4's own
    // framing) — a failure here is reported as a normal error response, not
    // a 500 that could be mistaken for the app itself being broken. The
    // frontend shows the score/signals with no narrative when this happens.
    // Log the cause; never hand internal error text to the client.
    console.error('coaching failed', err)
    return c.json({ error: 'coaching_unavailable' }, 502)
  }
})

// ---------- eval harness support (scripts/evaluate-coaching.mjs) ----------
//
// Dev/eval tool, not a product surface: lets the harness run an arbitrary
// system prompt against an arbitrary Workers AI model, reusing the SAME
// evidence formatting (buildPrompt) the production /insight endpoint uses,
// so config comparisons (old prompt vs. current prompt vs. a bigger model)
// are testing the same input text end to end. Returns raw, unparsed text —
// the harness does its own parsing/scoring across all configs uniformly,
// including configs never designed to produce the STATUS/SIGNAL/ACTION
// shape (that's an intentional part of what's being measured).
app.post('/eval/insight', async (c) => {
  const body = await c.req.json<{ model: string; systemPrompt: string; evidence: CoachingEvidence; maxTokens?: number }>()
  if (!body?.model || !body?.systemPrompt || !body?.evidence) {
    return c.json({ error: 'model, systemPrompt, and evidence are required' }, 400)
  }
  const start = Date.now()
  try {
    const result = await c.env.AI.run(body.model, {
      messages: [
        { role: 'system', content: body.systemPrompt },
        { role: 'user', content: buildPrompt(body.evidence) },
      ],
      max_tokens: body.maxTokens ?? 220,
    })
    const raw = (result as { response?: string }).response ?? ''
    return c.json({ raw, latencyMs: Date.now() - start })
  } catch (err) {
    return c.json({ error: (err as Error).message, latencyMs: Date.now() - start }, 502)
  }
})

export default app
