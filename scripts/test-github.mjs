// FR2 GitHub ingestion tests: the Worker module against a mocked GitHub API,
// the API merge (GitHub becomes a Live source, numbers only), and the
// admin-only "refresh data now" route.
//
// Run: node --no-warnings scripts/test-github.mjs

import { build } from 'esbuild'
import { ROOT, devEnv, prodEnv, call, addLiveTeam, makeSuite, assert } from './lib/api-harness.mjs'

const out = await build({
  entryPoints: [`${ROOT}worker-ingestion/src/github.ts`],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
})
const gh = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)

const NOW = Date.parse('2026-11-17T04:00:00Z')
const SPRINT = { id: 7, name: 'Sprint 1', state: 'active', startDate: '2026-10-13T00:00:00Z', endDate: '2026-10-27T00:00:00Z' }
const OLD = { id: 6, name: 'Sprint 0', state: 'closed', startDate: '2026-09-15T00:00:00Z', endDate: '2026-09-29T00:00:00Z' }

// A tiny fake of the GitHub REST endpoints the Worker calls.
function fakeGithub({ pulls, reviews, commitsByBranch }) {
  const calls = []
  const real = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = new URL(String(url)); calls.push(u.pathname + u.search)
    const p = u.pathname.replace('/repos/org/repo', '')
    const json = (b) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } })
    if (p === '/pulls') return json(pulls)
    if (p === '/branches') return json(Object.keys(commitsByBranch).map((name) => ({ name })))
    if (/^\/pulls\/\d+\/reviews$/.test(p)) return json(reviews[p.split('/')[2]] ?? [])
    if (p === '/commits') {
      const since = Date.parse(u.searchParams.get('since')), until = Date.parse(u.searchParams.get('until'))
      return json((commitsByBranch[u.searchParams.get('sha')] ?? []).filter((c) => { const t = Date.parse(c.commit.author.date); return t >= since && t <= until }))
    }
    return new Response('not found', { status: 404 })
  }
  return { calls, restore: () => { globalThis.fetch = real } }
}
const commit = (sha, login, date, message = 'Fix things', parents = [{}]) => ({ sha, author: login ? { login } : null, parents, commit: { author: { date }, message } })
const ENV = { GITHUB_REPO: 'org/repo', TEAM_TIMEZONE: 'America/New_York' }
const FIXTURE = {
  pulls: [
    { number: 1, user: { login: 'alice' }, created_at: '2026-10-14T12:00:00Z', closed_at: null }, // reviewed after 6 h
    { number: 2, user: { login: 'alice' }, created_at: '2026-10-20T12:00:00Z', closed_at: null }, // self-review only, still open
    { number: 3, user: { login: 'mallory' }, created_at: '2026-10-21T12:00:00Z', closed_at: null }, // not opted in
    { number: 4, user: { login: 'bob' }, created_at: '2026-10-22T12:00:00Z', closed_at: '2026-10-23T12:00:00Z' }, // closed unreviewed after 24 h
  ],
  reviews: {
    1: [{ user: { login: 'bob' }, submitted_at: '2026-10-14T18:00:00Z' }],
    2: [{ user: { login: 'alice' }, submitted_at: '2026-10-20T13:00:00Z' }],
  },
  commitsByBranch: {
    main: [
      commit('a1', 'alice', '2026-10-15T15:00:00Z'),
      commit('a2', 'alice', '2026-10-16T00:30:00Z'),
      commit('m1', 'mallory', '2026-10-16T01:00:00Z'),
      commit('b1', 'Bob', '2026-10-17T22:00:00Z'),
      commit('x1', null, '2026-10-17T02:00:00Z'),
      commit('ai1', 'alice', '2026-10-18T02:00:00Z', 'Add feature\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'),
      commit('ai2', 'bob', '2026-10-18T03:00:00Z', 'Tweak\n\nco-authored-by: GitHub Copilot <copilot@github.com>'),
      commit('pair', 'bob', '2026-10-18T04:00:00Z', 'Pairing\n\nCo-authored-by: Dana <dana@example.com>'),
      commit('mg1', 'alice', '2026-10-19T03:00:00Z', 'Merge pull request #1', [{}, {}]),
    ],
    feature: [commit('f1', 'alice', '2026-10-16T02:30:00Z')],
  },
}

const suite = makeSuite('GitHub ingestion (FR2)')

await suite.test('opted-in members only; review turnaround and after-hours share per sprint', async () => {
  const f = fakeGithub(FIXTURE)
  try {
    const log = []
    const [r] = await gh.runGithubIngestion(ENV, [SPRINT], new Set(['alice', 'bob']), log, NOW)
    const g = r.github
    // PR 1: 6 h; PR 2: open, self-review ignored, waiting since 10-20 12:00 to NOW; PR 4: 24 h; PR 3 excluded.
    const waiting = (NOW - Date.parse('2026-10-20T12:00:00Z')) / 3_600_000
    const expected = Math.round(((6 + waiting + 24) / 3) * 10) / 10
    assert(g.prCount === 3 && g.avgReviewTurnaroundHours === expected, JSON.stringify(g))
    // main only: a1 (11:00 EDT, day), a2 (20:30 EDT, late), b1 (18:00 EDT, day), pair (00:00 EDT, late; a human co-author is fine).
    // Excluded: m1 (not opted in), x1 (no login), ai1/ai2 (AI co-author), mg1 (merge commit), f1 (feature branch).
    assert(g.sample.commits === 4 && g.pctCommitsAfter7pm === 50 && g.sample.excludedAiCommits === 2, JSON.stringify(g))
    assert(g.sample.reviewedPrs === 1 && g.sample.waitingPrs === 2, JSON.stringify(g.sample))
    return `${g.prCount} PRs, ${g.avgReviewTurnaroundHours} h, ${g.pctCommitsAfter7pm}% after hours`
  } finally { f.restore() }
})
await suite.test('stored result holds team totals only: no logins', async () => {
  const f = fakeGithub(FIXTURE)
  try {
    const res = await gh.runGithubIngestion(ENV, [SPRINT], new Set(['alice', 'bob']), [], NOW)
    const text = JSON.stringify(res.map((r) => r.github))
    assert(!/alice|bob|mallory/i.test(text), text)
  } finally { f.restore() }
})
await suite.test('nobody opted in: no GitHub calls, no data for any sprint', async () => {
  const f = fakeGithub(FIXTURE)
  try {
    const res = await gh.runGithubIngestion(ENV, [SPRINT, OLD], new Set(), [], NOW)
    assert(res.every((r) => r.github === null) && f.calls.length === 0, `calls ${f.calls.length}`)
  } finally { f.restore() }
})
await suite.test('a sprint with commits but no PRs gets no GitHub row ("No data")', async () => {
  const f = fakeGithub({ ...FIXTURE, commitsByBranch: { main: [commit('o1', 'alice', '2026-09-16T15:00:00Z')] } })
  try {
    const [r] = await gh.runGithubIngestion(ENV, [OLD], new Set(['alice']), [], NOW)
    assert(r.github === null, JSON.stringify(r.github))
  } finally { f.restore() }
})
await suite.test('AI co-author trailers are recognised; human co-authors are not', async () => {
  assert(gh.isAiCoAuthored('x\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'), 'claude')
  assert(gh.isAiCoAuthored('x\nCo-authored-by: Copilot <copilot@github.com>'), 'copilot')
  assert(!gh.isAiCoAuthored('x\nCo-authored-by: Dana <dana@example.com>'), 'human')
  assert(!gh.isAiCoAuthored('Mention Claude in the body only'), 'body mention is not a trailer')
})
await suite.test('a GitHub error reports GitHub\'s reason, never the token', async () => {
  const real = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), { status: 403 })
  try {
    await gh.runGithubIngestion({ ...ENV, GITHUB_TOKEN: 'secret-token-123' }, [SPRINT], new Set(['alice']), [], NOW)
    throw new Error('expected a failure')
  } catch (e) {
    assert(/403: Resource not accessible/.test(e.message) && !e.message.includes('secret-token-123'), e.message)
  } finally { globalThis.fetch = real }
})
await suite.test('after-hours uses team local time (19:00 to 05:59), not UTC', async () => {
  assert(gh.isAfterHours('2026-10-16T00:30:00Z', 'America/New_York') === true, '20:30 ET')
  assert(gh.isAfterHours('2026-10-17T22:30:00Z', 'America/New_York') === false, '18:30 ET')
  assert(gh.isAfterHours('2026-10-17T10:30:00Z', 'America/New_York') === false, '06:30 ET')
})
await suite.test('an active sprint window runs to now; a closed one ends on its end date', async () => {
  assert(gh.windowFor(SPRINT, NOW).end === NOW && gh.windowFor(OLD, NOW).end === Date.parse(OLD.endDate), 'window')
})

// ---- API: GitHub becomes a Live source; only the three numbers leave the server ----
await suite.test('API: a sprint with a GitHub row shows GitHub "live" with numbers only; others stay placeholder', async () => {
  const { sqlite, env } = devEnv()
  addLiveTeam(sqlite, 'pilot', 'Pilot', [])
  const put = (week, source, payload) => sqlite.prepare('INSERT INTO signal_weeks (team_id, iso_week, source, payload, updated_at) VALUES (?, ?, ?, ?, 0)').run('pilot', week, source, JSON.stringify(payload))
  put('2026-W38', 'jira', { issueCount: 6, avgCycleTimeDays: 4, sprintCompletionPct: 17, sprint: OLD })
  put('2026-W42', 'jira', { issueCount: 17, avgCycleTimeDays: 2, sprintCompletionPct: 41, sprint: SPRINT })
  put('2026-W42', 'github', { prCount: 3, avgReviewTurnaroundHours: 230.5, pctCommitsAfter7pm: 33, sample: { commits: 3 }, sprint: SPRINT })
  const r = await call(env, 'GET', '/api/teams/pilot/signals')
  const [w1, w2] = r.json.weeks
  assert(w1.sources.github === 'placeholder' && w2.sources.github === 'live', JSON.stringify([w1.sources, w2.sources]))
  assert(JSON.stringify(Object.keys(w2.github).sort()) === '["avgReviewTurnaroundHours","pctCommitsAfter7pm","prCount"]', JSON.stringify(w2.github))
  assert(w2.github.avgReviewTurnaroundHours === 230.5 && !r.text.includes('sample'), r.text.slice(0, 200))
})

// ---- admin refresh through the service binding ----
await suite.test('POST /api/admin/refresh: admin runs ingestion via the binding; manager 403; no binding 503', async () => {
  const runs = []
  const INGEST = { fetch: async () => { runs.push(1); return new Response('✓ jira signals written for solstice: 2 sprint(s)\n✓ github signals written for solstice: 1 of 2 sprint(s)\n') } }
  const { env } = prodEnv({ roles: { 'lead@example.edu': 'manager' }, admins: ['admin@example.edu'], extra: { INGEST } })
  const a = await call(env, 'POST', '/api/admin/refresh', { email: 'admin@example.edu', body: {} })
  assert(a.status === 200 && a.json.log.length === 2 && runs.length === 1, a.text)
  assert((await call(env, 'POST', '/api/admin/refresh', { email: 'lead@example.edu', body: {} })).status === 403, 'manager')
  const { env: noBinding } = prodEnv({ admins: ['admin@example.edu'] })
  assert((await call(noBinding, 'POST', '/api/admin/refresh', { email: 'admin@example.edu', body: {} })).status === 503, 'no binding')
})

await suite.test('roster maps Solstice GitHub logins (migration 0007)', async () => {
  const { sqlite } = devEnv()
  const rows = sqlite.prepare("SELECT name, github_logins FROM roster_members WHERE team_id='solstice' AND github_logins != ''").all()
  assert(rows.length === 2 && rows.some((r) => r.github_logins.includes('KristennnnW')), JSON.stringify(rows))
})

suite.done()
