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

type Env = { DB: D1Database }

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

const app = new Hono<{ Bindings: Env }>().basePath('/api')

// ---------- teams ----------

app.get('/teams', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM teams ORDER BY created_at ASC').all<TeamRow>()
  return c.json((results ?? []).map(serializeTeam))
})

app.post('/teams', async (c) => {
  const body = await c.req.json<{ name?: string; sizeBucket?: string; functionType?: string }>()
  const name = (body.name ?? '').trim()
  if (!name) return c.json({ error: 'name is required' }, 400)

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

app.get('/teams/:id/signals', async (c) => {
  const teamId = c.req.param('id')
  const { weeks, source } = await getSignalsForTeam(c.env.DB, teamId)
  return c.json({ weeks, source })
})

export default app
