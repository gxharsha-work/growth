// FR4 (roster via CSV or manual entry) and FR18 (opt-in consent before any
// data enters a team score) tests, through the real API.
//
// Run: node --no-warnings scripts/test-roster-consent.mjs

import { devEnv, prodEnv, call, addLiveTeam, makeSuite, assert } from './lib/api-harness.mjs'

const suite = makeSuite('Roster and consent (FR4, FR18)')
const HEALTHY = [[30, 2.6, 88, 5], [31, 2.5, 90, 5], [33, 2.6, 89, 5], [34, 2.5, 91, 5]]

await suite.test('demo teams are seeded fully consented and keep their scores', async () => {
  const { env } = devEnv()
  for (const [id, n] of [['platform', 6], ['backend', 5]]) {
    const r = await call(env, 'GET', `/api/teams/${id}/roster`)
    assert(r.json.consent.consented === n && r.json.consent.total === n && r.json.consent.scoreAllowed, `${id}: ${JSON.stringify(r.json.consent)}`)
    const s = await call(env, 'GET', `/api/teams/${id}/signals`)
    assert(s.json.weeks.length > 0 && !s.json.withheld, `${id} signals withheld`)
  }
  return 'platform 6 of 6, backend 5 of 5'
})
await suite.test('live team with 0 of 6 opted in: signals withheld, coaching refused, model not called', async () => {
  const { sqlite, env } = devEnv(); const log = []; env.AI = { run: async () => { log.push(1); return { response: 'x' } } }
  addLiveTeam(sqlite, 'pilot', 'Pilot', HEALTHY, { consented: 0, notConsented: 6 })
  const s = await call(env, 'GET', '/api/teams/pilot/signals')
  assert(s.json.withheld === 'consent_required' && s.json.weeks.length === 0 && s.json.consent.consented === 0, JSON.stringify(s.json))
  const i = await call(env, 'POST', '/api/insight', { body: { teamId: 'pilot', week: 4 } })
  assert(i.status === 403 && i.json.error === 'consent_required' && log.length === 0, `HTTP ${i.status}, model calls ${log.length}`)
  return '0 of 6: no weeks returned, insight 403'
})
await suite.test('2 of 6 opted in: still withheld (minimum is 3)', async () => {
  const { sqlite, env } = devEnv(); addLiveTeam(sqlite, 'pilot', 'Pilot', HEALTHY, { consented: 2, notConsented: 4 })
  const s = await call(env, 'GET', '/api/teams/pilot/signals')
  assert(s.json.withheld && s.json.consent.consented === 2 && s.json.consent.minConsented === 3, JSON.stringify(s.json.consent))
})
await suite.test('team lead records consent: at 3 of 6 the score appears; a withdrawal hides it again', async () => {
  const { sqlite, env } = devEnv(); addLiveTeam(sqlite, 'pilot', 'Pilot', HEALTHY, { consented: 0, notConsented: 6 })
  const { members } = (await call(env, 'GET', '/api/teams/pilot/roster')).json
  for (const m of members.slice(0, 3)) assert((await call(env, 'PATCH', `/api/roster/${m.id}`, { body: { consented: true } })).status === 200, 'patch failed')
  let s = await call(env, 'GET', '/api/teams/pilot/signals')
  assert(!s.json.withheld && s.json.weeks.length === 4 && s.json.consent.consented === 3, JSON.stringify(s.json.consent))
  await call(env, 'PATCH', `/api/roster/${members[0].id}`, { body: { consented: false } })
  s = await call(env, 'GET', '/api/teams/pilot/signals')
  assert(s.json.withheld && s.json.consent.consented === 2, 'not withheld after withdrawal')
  return '0 -> 3 opted in: shown; 3 -> 2: withheld'
})
await suite.test('PATCH consent validates input: non-boolean 400, unknown member 404', async () => {
  const { env } = devEnv()
  assert((await call(env, 'PATCH', '/api/roster/1', { body: { consented: 'yes' } })).status === 400, 'not 400')
  assert((await call(env, 'PATCH', '/api/roster/999999', { body: { consented: true } })).status === 404, 'not 404')
})
await suite.test('generated team with no roster is synthetic data and not withheld', async () => {
  const { env } = devEnv()
  const t = await call(env, 'POST', '/api/teams', { body: { name: 'Sandbox Team' } })
  const s = await call(env, 'GET', `/api/teams/${t.json.id}/signals`)
  assert(s.json.source === 'generated' && !s.json.withheld && s.json.weeks.length > 0, JSON.stringify(s.json.consent))
})

// ---- CSV import ----
const CSV_OK = 'name,role,team,consented\nAlex Kim,Engineer,pilot,yes\n"Lee, Jordan",QA,Pilot,no\nSam Ortiz,Tech Lead,pilot,TRUE\nRui Costa,Engineer,pilot,1\n'
await suite.test('CSV import adds members, handles quotes and yes/no/true/1, and counts consent', async () => {
  const { sqlite, env } = devEnv(); addLiveTeam(sqlite, 'pilot', 'Pilot', HEALTHY, { consented: 0 })
  const r = await call(env, 'POST', '/api/teams/pilot/roster/import', { body: { csv: CSV_OK } })
  assert(r.status === 200 && r.json.imported === 4 && r.json.consent.consented === 3 && r.json.consent.scoreAllowed, `HTTP ${r.status} ${r.text}`)
  assert(r.json.members.some((m) => m.name === 'Lee, Jordan' && !m.consented), 'quoted name')
  const s = await call(env, 'GET', '/api/teams/pilot/signals')
  assert(!s.json.withheld, 'still withheld after import')
  return '4 imported, 3 of 4 opted in, score shown'
})
await suite.test('CSV re-import updates an existing member instead of duplicating', async () => {
  const { sqlite, env } = devEnv(); addLiveTeam(sqlite, 'pilot', 'Pilot', HEALTHY, { consented: 0 })
  await call(env, 'POST', '/api/teams/pilot/roster/import', { body: { csv: CSV_OK } })
  const r = await call(env, 'POST', '/api/teams/pilot/roster/import', { body: { csv: 'name,role,team,consented\nAlex Kim,Staff Engineer,pilot,no\n' } })
  const alex = r.json.members.filter((m) => m.name === 'Alex Kim')
  assert(alex.length === 1 && alex[0].role === 'Staff Engineer' && !alex[0].consented, JSON.stringify(alex))
})
for (const [label, csv, expect] of [
  ['missing header column', 'name,role,team\nA,B,pilot\n', /header must include consented/],
  ['row for another team', 'name,role,team,consented\nA,Eng,backend,yes\n', /not this team/],
  ['bad consent value', 'name,role,team,consented\nA,Eng,pilot,maybe\n', /yes or no/],
  ['duplicate member', 'name,role,team,consented\nA,Eng,pilot,yes\na,Eng,pilot,no\n', /twice/],
  ['empty name', 'name,role,team,consented\n,Eng,pilot,yes\n', /name is empty/],
]) {
  await suite.test(`CSV with ${label}: 400 with line numbers, nothing written`, async () => {
    const { sqlite, env } = devEnv(); addLiveTeam(sqlite, 'pilot', 'Pilot', HEALTHY, { consented: 0 })
    const before = sqlite.prepare("SELECT COUNT(*) n FROM roster_members WHERE team_id='pilot'").get().n
    const r = await call(env, 'POST', '/api/teams/pilot/roster/import', { body: { csv } })
    const after = sqlite.prepare("SELECT COUNT(*) n FROM roster_members WHERE team_id='pilot'").get().n
    assert(r.status === 400 && expect.test(JSON.stringify(r.json)) && before === after, `HTTP ${r.status} ${r.text}`)
    return r.json.errors?.[0] ? `line ${r.json.errors[0].line}: ${r.json.errors[0].message}` : r.json.error
  })
}
await suite.test('CSV over 50 KB is rejected', async () => {
  const { env } = devEnv()
  const r = await call(env, 'POST', '/api/teams/solstice/roster/import', { body: { csv: 'name,role,team,consented\n' + 'x'.repeat(60000) } })
  assert(r.status === 400, `HTTP ${r.status}`)
})

// ---- access ----
await suite.test('production: anonymous roster read 401; leadership can read but not change consent or import', async () => {
  const VP = 'vp@example.edu'
  const { env } = prodEnv({ roles: { [VP]: 'leadership' } })
  assert((await call(env, 'GET', '/api/teams/platform/roster')).status === 401, 'anon read')
  assert((await call(env, 'GET', '/api/teams/platform/roster', { email: VP })).status === 200, 'leadership read')
  assert((await call(env, 'PATCH', '/api/roster/1', { email: VP, body: { consented: false } })).status === 403, 'leadership patch')
  assert((await call(env, 'POST', '/api/teams/platform/roster/import', { email: VP, body: { csv: CSV_OK } })).status === 403, 'leadership import')
})

suite.done()
