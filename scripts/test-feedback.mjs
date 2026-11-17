// "Report an issue" (beta feedback): any signed-in user can write, only admins read.
//
// Run: node --no-warnings scripts/test-feedback.mjs

import { prodEnv, call, makeSuite, assert } from './lib/api-harness.mjs'

const ADMIN = 'admin@example.edu', LEAD = 'lead@example.edu', VP = 'vp@example.edu'
const fresh = () => prodEnv({ roles: { [LEAD]: 'manager', [VP]: 'leadership' }, admins: [ADMIN] })
const suite = makeSuite('Report an issue (feedback)')

await suite.test('leadership (read-only) can send a report: 201, stored with email, page and build', async () => {
  const { sqlite, env } = fresh()
  const r = await call(env, 'POST', '/api/feedback', { email: VP, body: { message: 'Garden looks faded, why?', page: '/ team=solstice week=2', buildSha: 'abc1234' } })
  const row = sqlite.prepare('SELECT email, page, build_sha, message FROM feedback').get()
  assert(r.status === 201 && row.email === VP && row.build_sha === 'abc1234' && row.page.includes('solstice'), `HTTP ${r.status} ${JSON.stringify(row)}`)
})
await suite.test('anonymous report -> 401', async () => { const { env } = fresh(); assert((await call(env, 'POST', '/api/feedback', { body: { message: 'x' } })).status === 401, 'not 401') })
await suite.test('empty or over-long message -> 400', async () => {
  const { env } = fresh()
  assert((await call(env, 'POST', '/api/feedback', { email: LEAD, body: { message: '   ' } })).status === 400, 'empty')
  assert((await call(env, 'POST', '/api/feedback', { email: LEAD, body: { message: 'x'.repeat(2001) } })).status === 400, 'long')
})
await suite.test('more than 20 reports a day from one user -> 429', async () => {
  const { env } = fresh(); let last
  for (let i = 0; i < 21; i++) last = await call(env, 'POST', '/api/feedback', { email: LEAD, body: { message: `report ${i}` } })
  assert(last.status === 429, `HTTP ${last.status}`)
})
await suite.test('only admins can read reports: admin 200, manager 403, leadership 403', async () => {
  const { env } = fresh()
  await call(env, 'POST', '/api/feedback', { email: LEAD, body: { message: 'hello' } })
  const a = await call(env, 'GET', '/api/feedback', { email: ADMIN })
  assert(a.status === 200 && a.json.length === 1 && a.json[0].message === 'hello', a.text)
  assert((await call(env, 'GET', '/api/feedback', { email: LEAD })).status === 403, 'manager read')
  assert((await call(env, 'GET', '/api/feedback', { email: VP })).status === 403, 'leadership read')
})
await suite.test('the feedback exception does not open other writes to leadership', async () => {
  const { env } = fresh()
  assert((await call(env, 'POST', '/api/teams', { email: VP, body: { name: 'X' } })).status === 403, 'leadership create team')
})
suite.done()
