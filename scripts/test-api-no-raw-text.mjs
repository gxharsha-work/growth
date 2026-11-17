// FR17 / privacy contract test: no API response may contain raw ticket
// summaries or calendar event titles, even when the database still holds them.
//
// Seeds D1 rows that carry ticket- and event-level `details` with sentinel
// strings, then calls EVERY GET route the app registers (discovered from
// app.routes, so a new endpoint is covered automatically) plus POST /insight.
// Fails if any sentinel appears in any response body.
//
// Run: node --no-warnings scripts/test-api-no-raw-text.mjs

import fs from 'node:fs'
import path from 'node:path'
import { ROOT, app, devEnv, call, addLiveTeam, makeSuite, assert } from './lib/api-harness.mjs'

const TICKET = 'SENTINEL-TICKET-TITLE-7f3a'
const EVENT = 'SENTINEL-EVENT-TITLE-9c1e'
const SENTINELS = [TICKET, EVENT, 'summary', 'Standup with Jordan']

const suite = makeSuite('No raw ticket or event text in any API response')
const { sqlite, env } = devEnv()
addLiveTeam(sqlite, 'leaky', 'Leaky Team', [[20, 3, 80, 6], [21, 3.1, 78, 6], [19, 3.4, 70, 7], [18, 5.9, 45, 12]], {
  jiraExtra: { details: [{ key: 'X-1', summary: TICKET, status: 'Done' }] },
  calendarExtra: { details: [{ title: EVENT, hours: 1 }, { title: 'Standup with Jordan', hours: 0.5 }] },
})
sqlite.prepare("INSERT INTO buildings (id, team_id, name, archetype, notes, col, row, updated_at) VALUES ('btest-1', 'leaky', 'Docs', 'library', '', 0, 0, 0)").run()

const getRoutes = [...new Set(app.routes.filter((r) => r.method === 'GET').map((r) => r.path))]
  .filter((p) => !p.includes('*'))
  .map((p) => p.replace(/:id\b/, p.startsWith('/api/buildings') ? 'btest-1' : 'leaky'))

const clean = (text) => SENTINELS.find((s) => text.includes(s))

for (const p of getRoutes) {
  await suite.test(`GET ${p}`, async () => {
    const r = await call(env, 'GET', p)
    const hit = clean(r.text)
    assert(!hit, `HTTP ${r.status} contains "${hit}"`)
    return `HTTP ${r.status}, ${r.text.length} bytes`
  })
}
for (const week of [1, 4]) {
  await suite.test(`POST /api/insight week ${week}`, async () => {
    const r = await call(env, 'POST', '/api/insight', { body: { teamId: 'leaky', week } })
    const hit = clean(r.text)
    assert(!hit, `HTTP ${r.status} contains "${hit}"`)
    return `HTTP ${r.status}`
  })
}
await suite.test('at least the signals route was exercised', async () => {
  assert(getRoutes.includes('/api/teams/leaky/signals'), `routes: ${getRoutes.join(', ')}`)
  return `${getRoutes.length} GET routes`
})
await suite.test('no migration seeds ticket summaries or event titles', async () => {
  const dir = path.join(ROOT, 'migrations')
  for (const f of fs.readdirSync(dir)) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8')
    assert(!/"summary"\s*:|"title"\s*:/.test(sql), `${f} contains raw text fields`)
  }
})
suite.done()
