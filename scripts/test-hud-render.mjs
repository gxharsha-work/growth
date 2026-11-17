// Renders the real TeamHUD (react-dom/server) for a demo team and checks the
// structure a manager sees: score, baseline, cohort, roster slot and the
// three signal pills are all present, and the early-warning wrapper holds
// only the banner (a wrapper that swallowed the rest of the HUD hid it on
// every week without a warning).
//
// Run: node --no-warnings scripts/test-hud-render.mjs

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { ROOT, makeSuite, assert } from './lib/api-harness.mjs'

// zustand v5 renders from each store's INITIAL state on the server, so each
// case is its own bundle whose app and signals stores start on the chosen
// team and week (a text substitution in those two files, test-only).
async function renderCase(teamId, week, { loaded = true, error = false, role = 'manager', isAdmin = true, githubSync = null } = {}) {
  const initial = {
    name: 'test-initial-state',
    setup(b) {
      b.onLoad({ filter: /src[\\/]store[\\/](appStore|signalsStore|authStore)\.js$/ }, async (args) => {
        let code = fs.readFileSync(args.path, 'utf8')
        code = code.replace('currentTeam: firstTeamId(),', `currentTeam: ${JSON.stringify(teamId)},`).replace('currentWeek: 0,', `currentWeek: ${week},`)
        if (loaded) code = code.replace('weeklyByTeam: {},', `weeklyByTeam: { [${JSON.stringify(teamId)}]: getWeeklySignalsForTeam(${JSON.stringify(teamId)}) },`)
        code = code.replace("role: 'manager',\n  isAdmin: true,", `role: ${JSON.stringify(role)},\n  isAdmin: ${isAdmin},`)
        if (githubSync) code = code.replace('githubSyncByTeam: {},', `githubSyncByTeam: { [${JSON.stringify(teamId)}]: ${JSON.stringify(githubSync)} },`)
        if (error) code = code.replace('errorByTeam: {},', `errorByTeam: { [${JSON.stringify(teamId)}]: true },`)
        code = code.replace('sourceByTeam: {},', `sourceByTeam: { [${JSON.stringify(teamId)}]: 'hand-tuned' },`)
        return { contents: code, loader: 'jsx' }
      })
    },
  }
  const out = await build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import TeamHUD from './src/ui/TeamHUD'
        export const html = renderToStaticMarkup(createElement(TeamHUD))
      `,
      resolveDir: ROOT, loader: 'jsx',
    },
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', packages: 'external',
    jsx: 'automatic', loader: { '.css': 'empty', '.json': 'json', '.js': 'jsx' }, plugins: [initial],
    define: { 'import.meta.env': '{}' },
  })
  // npm packages stay external (loaded by Node), so the bundle must sit inside
  // the repo to resolve them: node_modules/.cache is git-ignored.
  const dir = path.join(ROOT, 'node_modules', '.cache', 'growth-test')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `hud-${teamId}-${week}-${loaded}-${error}-${role}-${isAdmin}-${githubSync?.status ?? 'none'}.mjs`)
  fs.writeFileSync(file, out.outputFiles[0].text)
  return (await import(pathToFileURL(file).href)).html
}

// Returns the outer HTML of the first element whose class list contains cls.
function element(html, cls) {
  const start = html.search(new RegExp(`<div[^>]*class="${cls}[" ]`))
  if (start < 0) return null
  let depth = 0
  const re = /<(\/?)div\b[^>]*>/g
  re.lastIndex = start
  let m
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return html.slice(start, re.lastIndex)
  }
  return null
}

const suite = makeSuite('TeamHUD render structure')
for (const [team, week, flagged] of [['platform', 7, false], ['backend', 5, true]]) {
  await suite.test(`${team} week ${week + 1}: all HUD sections render; warning ${flagged ? 'shown' : 'absent'}`, async () => {
    const html = await renderCase(team, week)
    assert(html.includes(`Week ${week + 1}`), 'rendered the wrong week')
    for (const cls of ['hud-score glass', 'hud-context glass']) assert(element(html, cls), `missing ${cls}`)
    assert((html.match(/hud-source-tag--/g) ?? []).length === 3, 'expected 3 signal pills with badges')
    const wrap = element(html, 'hud-warning-wrap')
    assert(wrap && !wrap.includes('hud-context') && !wrap.includes('hud-source-tag'), 'warning wrapper contains other HUD sections')
    assert(wrap.includes('hud-warning"') === flagged, `banner ${flagged ? 'missing' : 'present'}`)
    return flagged ? 'banner inside wrapper only' : 'wrapper empty'
  })
}
await suite.test('data still loading: a "Loading team data" status, not a blank HUD', async () => {
  const html = await renderCase('platform', 0, { loaded: false })
  assert(html.includes('Loading team data') && html.includes('role="status"'), 'no loading state')
})
await suite.test('data failed to load: a plain-language alert, no raw error text', async () => {
  const html = await renderCase('platform', 0, { loaded: false, error: true })
  assert(html.includes('could not be loaded') && html.includes('role="alert"') && !html.includes('Loading team data'), 'no error state')
})
// ---- IT-01: controls follow the role ----
const controls = (html) => ({ del: /aria-label="Delete /.test(html), rename: /aria-label="Rename /.test(html), edit: /hud-team-edit/.test(html), create: /New team/.test(html) })
await suite.test('admin sees rename and delete', async () => {
  const c = controls(await renderCase('platform', 0, { role: 'manager', isAdmin: true }))
  assert(c.del && c.rename, JSON.stringify(c))
})
await suite.test('team lead (manager, not admin) sees no delete and no rename, only cohort editing', async () => {
  const c = controls(await renderCase('platform', 0, { role: 'manager', isAdmin: false }))
  assert(!c.del && !c.rename && c.edit, JSON.stringify(c))
})
await suite.test('leadership (read-only) sees no edit, delete or create controls', async () => {
  const c = controls(await renderCase('platform', 0, { role: 'leadership', isAdmin: false }))
  assert(!c.del && !c.rename && !c.edit && !c.create, JSON.stringify(c))
})
// ---- GitHub badge: connected vs not connected (live team without qualifying GitHub data) ----
await suite.test('GitHub synced but no qualifying data: "Connected · no qualifying data yet" with tooltip', async () => {
  const html = await renderCase('solstice', 1, { githubSync: { status: 'ok', lastRun: '2026-11-17T04:48:00Z' } })
  assert(html.includes('Connected · no qualifying data yet') && html.includes('GitHub: connected') && html.includes('human-authored commits on main'), 'badge missing')
})
await suite.test('GitHub never synced: "No data" and "GitHub: not connected"', async () => {
  const html = await renderCase('solstice', 1)
  assert(html.includes('GitHub: not connected') && !html.includes('Connected · no qualifying'), 'wrong badge')
})
await suite.test('coaching errors never show raw server text', async () => {
  const src = fs.readFileSync(`${ROOT}src/ui/CoachingNote.jsx`, 'utf8')
  assert(!/\(\$\{error\}\)/.test(src) && /Please try again later/.test(src), 'raw error interpolated')
})
suite.done()
