// Smoke test for a deployed Growth environment (preview or production).
//
// Anonymous checks always run: every page and API route must be stopped by
// Cloudflare Access (redirect to the login, or 401/403), including writes.
//
// Signed-in checks run when CF_AUTHORIZATION holds a valid Access session
// cookie (copy `CF_Authorization` from the browser after logging in):
// /api/health is ok, /api/me names the user, every GET API response is free
// of raw ticket or event text, and the team page loads.
//
// Run: node scripts/smoke-test.mjs https://growth-3it.pages.dev [--out=file.md]
//      CF_AUTHORIZATION=<cookie> node scripts/smoke-test.mjs <url>

import fs from 'node:fs'

const base = (process.argv.find((a) => a.startsWith('https://')) ?? 'https://growth-3it.pages.dev').replace(/\/$/, '')
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
const cookie = process.env.CF_AUTHORIZATION
const ACCESS_LOGIN = 'cloudflareaccess.com/cdn-cgi/access/login'

const rows = []
async function check(name, fn) {
  const t0 = Date.now()
  let ok = false, detail = ''
  try { ({ ok, detail } = await fn()) } catch (e) { detail = `threw: ${e.message}` }
  rows.push({ name, ok, detail, ms: Date.now() - t0 })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`)
}
const anon = (p, method = 'GET') => fetch(`${base}${p}`, { method, redirect: 'manual' })
const blocked = (r) => (r.status === 302 && (r.headers.get('location') ?? '').includes(ACCESS_LOGIN)) || r.status === 401 || r.status === 403

const ANON_PATHS = ['/', '/index.html', '/api/teams', '/api/me', '/api/health', '/api/teams/solstice/signals', '/api/teams/solstice/roster']
for (const p of ANON_PATHS) {
  await check(`anonymous GET ${p} is blocked`, async () => { const r = await anon(p); return { ok: blocked(r), detail: `HTTP ${r.status}` } })
}
for (const [method, p] of [['DELETE', '/api/teams/solstice'], ['PATCH', '/api/teams/solstice'], ['POST', '/api/teams'], ['POST', '/api/insight']]) {
  await check(`anonymous ${method} ${p} is blocked`, async () => { const r = await anon(p, method); return { ok: blocked(r), detail: `HTTP ${r.status}` } })
}

if (cookie) {
  const authed = (p) => fetch(`${base}${p}`, { headers: { cookie: `CF_Authorization=${cookie}` }, redirect: 'manual' })
  const RAW = [/"summary"/, /"title"/, /"details"/]
  await check('signed in: GET /api/health reports ok', async () => {
    const r = await authed('/api/health'); const j = await r.json().catch(() => null)
    return { ok: r.status === 200 && j?.status === 'ok', detail: `HTTP ${r.status}, ${JSON.stringify(j?.checks ?? j)}` }
  })
  await check('signed in: GET /api/me names the user', async () => {
    const r = await authed('/api/me'); const j = await r.json().catch(() => null)
    return { ok: r.status === 200 && !!j?.email, detail: `HTTP ${r.status}, role ${j?.role}, admin ${j?.isAdmin}` }
  })
  const teams = await (await authed('/api/teams')).json().catch(() => [])
  for (const t of Array.isArray(teams) ? teams : []) {
    for (const p of [`/api/teams/${t.id}/signals`, `/api/teams/${t.id}/buildings`, `/api/teams/${t.id}/roster`]) {
      await check(`signed in: ${p} has no raw text`, async () => {
        const r = await authed(p); const text = await r.text()
        const hit = RAW.find((re) => re.test(text))
        return { ok: r.status === 200 && !hit, detail: `HTTP ${r.status}${hit ? `, contains ${hit}` : ''}` }
      })
    }
  }
  await check('signed in: team page loads', async () => {
    const r = await authed('/'); const html = await r.text()
    return { ok: r.status === 200 && html.includes('<div id="root">'), detail: `HTTP ${r.status}, ${html.length} bytes` }
  })
} else {
  console.log('(signed-in checks skipped: set CF_AUTHORIZATION to run them)')
}

const failed = rows.filter((r) => !r.ok).length
const summary = `${rows.length - failed} of ${rows.length} checks pass against ${base} (${new Date().toISOString()})${cookie ? '' : ', anonymous checks only'}`
console.log(`\n${summary}`)
if (out) {
  fs.writeFileSync(out, [`# Smoke test`, '', summary, '', '| Check | Result | Detail |', '| --- | --- | --- |', ...rows.map((r) => `| ${r.name} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail} |`), ''].join('\n'))
}
process.exit(failed ? 1 : 0)
