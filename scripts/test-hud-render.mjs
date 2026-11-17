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
async function renderCase(teamId, week) {
  const initial = {
    name: 'test-initial-state',
    setup(b) {
      b.onLoad({ filter: /src[\\/]store[\\/](appStore|signalsStore)\.js$/ }, async (args) => {
        let code = fs.readFileSync(args.path, 'utf8')
        code = code.replace('currentTeam: firstTeamId(),', `currentTeam: ${JSON.stringify(teamId)},`).replace('currentWeek: 0,', `currentWeek: ${week},`)
        code = code.replace('weeklyByTeam: {},', `weeklyByTeam: { [${JSON.stringify(teamId)}]: getWeeklySignalsForTeam(${JSON.stringify(teamId)}) },`)
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
  const file = path.join(dir, `hud-${teamId}-${week}.mjs`)
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
suite.done()
