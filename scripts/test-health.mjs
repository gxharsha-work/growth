// GET /api/health: D1 status, Workers AI binding, ingestion freshness, build.
//
// Run: node --no-warnings scripts/test-health.mjs

import fs from 'node:fs'
import { ROOT, devEnv, prodEnv, call, makeSuite, assert } from './lib/api-harness.mjs'

const suite = makeSuite('Health endpoint')
const HOUR = 3_600_000
const assets = (body) => ({ fetch: async (req) => (new URL(req.url).pathname === '/build.json' ? new Response(JSON.stringify(body)) : new Response('', { status: 404 })) })
const setLastIngest = (sqlite, msAgo) => sqlite.prepare("UPDATE signal_weeks SET updated_at = ? WHERE source IN ('jira','calendar')").run(Date.now() - msAgo)

await suite.test('all good: status ok, D1 ok, AI bound, ingestion fresh, build sha from /build.json', async () => {
  const { sqlite, env } = devEnv({ ASSETS: assets({ sha: 'abc1234def', version: '0.9.0-beta' }) })
  setLastIngest(sqlite, 2 * HOUR)
  const r = await call(env, 'GET', '/api/health')
  const j = r.json
  assert(r.status === 200 && j.status === 'ok' && j.checks.d1.status === 'ok' && j.checks.workersAi.status === 'bound' && j.checks.ingestion.status === 'fresh' && j.build.sha === 'abc1234def', r.text)
  return `ingestion ${j.checks.ingestion.ageHours} h old`
})
await suite.test('ingestion older than 36 h: degraded, stale', async () => {
  const { sqlite, env } = devEnv(); setLastIngest(sqlite, 50 * HOUR)
  const j = (await call(env, 'GET', '/api/health')).json
  assert(j.status === 'degraded' && j.checks.ingestion.status === 'stale', JSON.stringify(j.checks))
})
await suite.test('Workers AI binding missing: degraded, and the model is never called by the check', async () => {
  const { sqlite, env } = devEnv(); setLastIngest(sqlite, HOUR); delete env.AI
  const j = (await call(env, 'GET', '/api/health')).json
  assert(j.status === 'degraded' && j.checks.workersAi.status === 'missing', JSON.stringify(j.checks))
  const calls = []; const env2 = devEnv().env; env2.AI = { run: async () => { calls.push(1) } }
  await call(env2, 'GET', '/api/health'); assert(calls.length === 0, 'model was called')
})
await suite.test('D1 down: 503 JSON with status down, no stack trace', async () => {
  const env = { DB: { prepare() { throw new Error('D1 unavailable') } }, AI: { run: async () => ({}) }, DEV_AUTH_ROLE: 'manager' }
  const r = await call(env, 'GET', '/api/health')
  assert(r.status === 503 && r.json?.status === 'down' && r.json.checks.d1.status === 'down' && !/\bat \S+:\d+/.test(r.text), `HTTP ${r.status} ${r.text}`)
})
await suite.test('no build.json available: build sha "unknown", still answers', async () => {
  const { env } = devEnv(); const j = (await call(env, 'GET', '/api/health')).json
  assert(j.build.sha === 'unknown', JSON.stringify(j.build))
})
await suite.test('production: anonymous health check is refused (401)', async () => {
  const { env } = prodEnv(); assert((await call(env, 'GET', '/api/health')).status === 401, 'not 401')
})
// ---- security headers ----
await suite.test('every API response, including 401 and 400, is no-store and nosniff', async () => {
  const { env } = prodEnv(); const { env: dev } = devEnv()
  for (const r of [await call(env, 'GET', '/api/teams'), await call(dev, 'GET', '/api/teams'), await call(dev, 'POST', '/api/insight', { body: '{bad' })]) {
    assert(r.headers.get('cache-control') === 'no-store' && r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('x-frame-options') === 'DENY', `HTTP ${r.status}`)
  }
})
await suite.test('static assets: _headers sets CSP, HSTS, nosniff, Referrer-Policy and frame-ancestors none', async () => {
  const h = fs.readFileSync(`${ROOT}public/_headers`, 'utf8')
  for (const k of ['Content-Security-Policy:', "default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", 'Strict-Transport-Security: max-age=31536000', 'X-Content-Type-Options: nosniff', 'Referrer-Policy:']) assert(h.includes(k), k)
})
suite.done()
