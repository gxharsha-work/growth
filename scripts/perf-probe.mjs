// Measures signed-in API latency on a deployed environment (p50/p95/max),
// with a modest load: N requests per endpoint, C at a time. Read-only routes
// only; the AI coaching route is not called (it has a per-user hourly limit).
//
// Run: CF_AUTHORIZATION=<cookie> node scripts/perf-probe.mjs https://growth-3it.pages.dev [N=100] [C=10] [--out=file.md]

import fs from 'node:fs'

const base = (process.argv.find((a) => a.startsWith('https://')) ?? 'https://growth-3it.pages.dev').replace(/\/$/, '')
const nums = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number)
const [N, C] = [nums[0] ?? 100, nums[1] ?? 10]
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
const headers = { cookie: `CF_Authorization=${process.env.CF_AUTHORIZATION ?? ''}` }
const ROUTES = ['/', '/api/health', '/api/teams', '/api/teams/platform/signals', '/api/teams/solstice/signals', '/api/teams/platform/roster']

const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]
const rows = []
for (const route of ROUTES) {
  const lat = []; let ok = 0; let i = 0
  const worker = async () => {
    while (i < N) {
      i++
      const t = performance.now()
      try { const r = await fetch(base + route, { headers, redirect: 'manual' }); await r.arrayBuffer(); if (r.status === 200) ok++ } catch { /* counted as not ok */ }
      lat.push(performance.now() - t)
    }
  }
  await Promise.all(Array.from({ length: C }, worker))
  lat.sort((a, b) => a - b)
  rows.push({ route, ok, n: N, p50: Math.round(q(lat, 0.5)), p95: Math.round(q(lat, 0.95)), max: Math.round(lat.at(-1)) })
  console.log(`${route}: ${ok}/${N} OK, p50 ${rows.at(-1).p50} ms, p95 ${rows.at(-1).p95} ms`)
}
if (out) {
  fs.writeFileSync(out, [
    `# API latency, signed in (${base}, ${new Date().toISOString()})`, '',
    `${N} requests per route, ${C} at a time, from one client in California.`, '',
    '| Route | 200 OK | p50 | p95 | max |', '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.route} | ${r.ok} of ${r.n} | ${r.p50} ms | ${r.p95} ms | ${r.max} ms |`), '',
  ].join('\n'))
}
