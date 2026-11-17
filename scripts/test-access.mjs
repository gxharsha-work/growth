// IT-01 access-control tests, run against the production auth path.
//
// Every request goes through the real Cloudflare Access JWT check
// (functions/api/_lib/auth.ts) with tokens signed by a test RS256 key whose
// public half is served as the Access certs endpoint. Covers anonymous,
// forged, expired and wrong-audience tokens, the three roles, and the
// admin-only rename and delete.
//
// Run: node --no-warnings scripts/test-access.mjs

import crypto from 'node:crypto'
import { prodEnv, call, accessToken, makeSuite, assert, ACCESS } from './lib/api-harness.mjs'

const ADMIN = 'admin@example.edu'
const MANAGER = 'lead@example.edu'
const VIEWER = 'vp@example.edu'
const STRANGER = 'someone@example.edu'
const fresh = () => prodEnv({ roles: { [MANAGER]: 'manager', [VIEWER]: 'leadership' }, admins: [ADMIN] })
const expect = (r, code) => assert(r.status === code, `expected ${code}, got ${r.status} ${r.text.slice(0, 80)}`)

const suite = makeSuite('Access control (production mode, Cloudflare Access JWT)')

// ---- anonymous and bad tokens ----
await suite.test('anonymous GET /api/teams -> 401', async () => { const { env } = fresh(); expect(await call(env, 'GET', '/api/teams'), 401) })
await suite.test('anonymous GET /api/teams/solstice/signals -> 401', async () => { const { env } = fresh(); expect(await call(env, 'GET', '/api/teams/solstice/signals'), 401) })
await suite.test('anonymous DELETE /api/teams/solstice -> 401, team kept', async () => {
  const { sqlite, env } = fresh()
  expect(await call(env, 'DELETE', '/api/teams/solstice'), 401)
  assert(sqlite.prepare("SELECT COUNT(*) n FROM teams WHERE id='solstice'").get().n === 1, 'team was deleted')
})
await suite.test('anonymous PATCH rename -> 401', async () => { const { env } = fresh(); expect(await call(env, 'PATCH', '/api/teams/solstice', { body: { name: 'Hacked' } }), 401) })
await suite.test('DEV_AUTH_ROLE bypass is ignored in production -> 401', async () => {
  const { env } = fresh(); env.DEV_AUTH_ROLE = 'manager'
  expect(await call(env, 'GET', '/api/teams'), 401)
})
await suite.test('token signed by a different key -> 401', async () => {
  const { env } = fresh()
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const real = accessToken(ADMIN).split('.')
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${real[0]}.${real[1]}`), privateKey).toString('base64url')
  expect(await call(env, 'GET', '/api/teams', { headers: { 'Cf-Access-JWT-Assertion': `${real[0]}.${real[1]}.${sig}` } }), 401)
})
await suite.test('expired token -> 401', async () => {
  const { env } = fresh()
  expect(await call(env, 'GET', '/api/teams', { headers: { 'Cf-Access-JWT-Assertion': accessToken(ADMIN, { exp: Math.floor(Date.now() / 1000) - 60 }) } }), 401)
})
await suite.test('token for another Access application (wrong audience) -> 401', async () => {
  const { env } = fresh()
  expect(await call(env, 'GET', '/api/teams', { headers: { 'Cf-Access-JWT-Assertion': accessToken(ADMIN, { aud: 'other-app' }) } }), 401)
})
await suite.test('signed in but no role assigned -> 403', async () => { const { env } = fresh(); expect(await call(env, 'GET', '/api/teams', { email: STRANGER }), 403) })

// ---- leadership (read-only) ----
await suite.test('leadership GET /api/teams -> 200', async () => { const { env } = fresh(); expect(await call(env, 'GET', '/api/teams', { email: VIEWER }), 200) })
await suite.test('leadership POST /api/teams -> 403', async () => { const { env } = fresh(); expect(await call(env, 'POST', '/api/teams', { email: VIEWER, body: { name: 'X' } }), 403) })
await suite.test('leadership DELETE team -> 403', async () => { const { env } = fresh(); expect(await call(env, 'DELETE', '/api/teams/solstice', { email: VIEWER }), 403) })

// ---- manager (team lead, not admin) ----
await suite.test('manager /api/me -> role manager, isAdmin false', async () => {
  const { env } = fresh(); const r = await call(env, 'GET', '/api/me', { email: MANAGER })
  expect(r, 200); assert(r.json.role === 'manager' && r.json.isAdmin === false, JSON.stringify(r.json))
})
await suite.test('manager may edit cohort tags -> 200', async () => {
  const { env } = fresh(); expect(await call(env, 'PATCH', '/api/teams/solstice', { email: MANAGER, body: { sizeBucket: '1-5 engineers', functionType: 'Growth Marketing' } }), 200)
})
await suite.test('manager rename -> 403, name kept', async () => {
  const { sqlite, env } = fresh()
  expect(await call(env, 'PATCH', '/api/teams/solstice', { email: MANAGER, body: { name: 'Renamed' } }), 403)
  assert(sqlite.prepare("SELECT name FROM teams WHERE id='solstice'").get().name !== 'Renamed', 'name changed')
})
await suite.test('manager delete -> 403, team kept', async () => {
  const { sqlite, env } = fresh()
  expect(await call(env, 'DELETE', '/api/teams/solstice', { email: MANAGER }), 403)
  assert(sqlite.prepare("SELECT COUNT(*) n FROM teams WHERE id='solstice'").get().n === 1, 'team was deleted')
})

// ---- admin ----
await suite.test('admin /api/me -> isAdmin true (no D1 role row needed)', async () => {
  const { env } = fresh(); const r = await call(env, 'GET', '/api/me', { email: ADMIN })
  expect(r, 200); assert(r.json.isAdmin === true && r.json.role === 'manager', JSON.stringify(r.json))
})
await suite.test('admin rename -> 200', async () => {
  const { sqlite, env } = fresh()
  expect(await call(env, 'PATCH', '/api/teams/solstice', { email: ADMIN, body: { name: 'Solstice Growth' } }), 200)
  assert(sqlite.prepare("SELECT name FROM teams WHERE id='solstice'").get().name === 'Solstice Growth', 'name not changed')
})
await suite.test('admin delete -> 200, team removed', async () => {
  const { sqlite, env } = fresh()
  expect(await call(env, 'DELETE', '/api/teams/backend', { email: ADMIN }), 200)
  assert(sqlite.prepare("SELECT COUNT(*) n FROM teams WHERE id='backend'").get().n === 0, 'team still there')
})
await suite.test('admin email match is case-insensitive', async () => {
  const { env } = prodEnv({ admins: ['Admin@Example.EDU'] })
  const r = await call(env, 'GET', '/api/me', { email: ADMIN }); expect(r, 200); assert(r.json.isAdmin, 'not admin')
})
await suite.test(`issuer must be the configured team domain (${ACCESS.domain})`, async () => {
  const { env } = fresh(); env.ACCESS_TEAM_DOMAIN = 'someone-else.cloudflareaccess.com'
  expect(await call(env, 'GET', '/api/teams', { email: ADMIN }), 401)
})

// ---- university domains: read-only by default ----
await suite.test('CMU emails with no role get read-only leadership; other domains still 403; a role row wins', async () => {
  const { env } = prodEnv({ roles: { 'lead@andrew.cmu.edu': 'manager' }, extra: { READONLY_DOMAINS: 'andrew.cmu.edu,cmu.edu' } })
  for (const email of ['student@andrew.cmu.edu', 'prof@cmu.edu']) {
    const me = await call(env, 'GET', '/api/me', { email })
    assert(me.status === 200 && me.json.role === 'leadership' && !me.json.isAdmin, `${email}: ${me.text}`)
    assert((await call(env, 'GET', '/api/teams', { email })).status === 200, `${email} read`)
    assert((await call(env, 'POST', '/api/teams', { email, body: { name: 'X' } })).status === 403, `${email} write`)
    assert((await call(env, 'DELETE', '/api/teams/solstice', { email })).status === 403, `${email} delete`)
  }
  assert((await call(env, 'GET', '/api/teams', { email: 'someone@gmail.com' })).status === 403, 'gmail without role')
  assert((await call(env, 'GET', '/api/teams', { email: 'x@evilcmu.edu' })).status === 403, 'look-alike domain')
  assert((await call(env, 'GET', '/api/me', { email: 'lead@andrew.cmu.edu' })).json.role === 'manager', 'role row should win')
})

suite.done()
