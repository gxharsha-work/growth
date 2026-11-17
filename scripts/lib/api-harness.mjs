// Shared test harness for the Growth API: the REAL Hono app (bundled from
// functions/api/_lib/app.ts with esbuild), a real SQLite database built from
// the repo's migrations (node:sqlite standing in for D1), and a signed-in
// Cloudflare Access user simulated with a real RS256 key pair, so the
// production JWT check runs unchanged. Needs Node >= 22.5 (node:sqlite).

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { build } from 'esbuild'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))

const bundle = await build({
  stdin: { contents: `export { default as app } from './functions/api/_lib/app'`, resolveDir: ROOT, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
})
export const { app } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)

// Handled 500s log a stack trace on purpose; keep test output readable.
console.error = () => {}

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = [] }
  bind(...a) { this.args = a; return this }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })) } }
  async first() { const r = this.db.prepare(this.sql).get(...this.args); return r ? { ...r } : null }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: r.changes } } }
}
export function freshDb() {
  const sqlite = new DatabaseSync(':memory:')
  const dir = path.join(ROOT, 'migrations')
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  return { sqlite, d1: { prepare: (sql) => new Stmt(sqlite, sql), batch: async (stmts) => Promise.all(stmts.map((s) => s.run())) } }
}

export const OK_AI = (log = []) => ({ run: async (_m, opts) => { log.push(opts.messages.map((m) => m.content).join('\n')); return { response: 'ACTION: Limit work in progress so items finish before new ones start.' } } })

// ---------- simulated Cloudflare Access ----------
export const ACCESS = { domain: 'growth-test.cloudflareaccess.com', aud: 'test-aud-tag' }
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'test-key-1'
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256' }
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (String(url) === `https://${ACCESS.domain}/cdn-cgi/access/certs`) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } })
  return realFetch(url, init)
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
export function accessToken(email, { exp = Math.floor(Date.now() / 1000) + 600, aud = ACCESS.aud } = {}) {
  const head = b64({ alg: 'RS256', kid: KID, typ: 'JWT' })
  const body = b64({ email, aud: [aud], iss: `https://${ACCESS.domain}`, exp })
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')
  return `${head}.${body}.${sig}`
}

// A production-mode environment with Access configured and roles seeded.
export function prodEnv({ roles = {}, admins = [], extra = {} } = {}) {
  const { sqlite, d1 } = freshDb()
  for (const [email, role] of Object.entries(roles)) sqlite.prepare('INSERT INTO role_assignments (email, role) VALUES (?, ?)').run(email, role)
  return {
    sqlite,
    env: { DB: d1, AI: OK_AI(), ENVIRONMENT: 'production', ACCESS_TEAM_DOMAIN: ACCESS.domain, ACCESS_AUD: ACCESS.aud, ADMIN_EMAILS: admins.join(','), ...extra },
  }
}
// Local-development environment (DEV_AUTH_ROLE bypass, never honoured in production).
export function devEnv(extra = {}) {
  const { sqlite, d1 } = freshDb()
  return { sqlite, env: { DB: d1, AI: OK_AI(), DEV_AUTH_ROLE: 'manager', ...extra } }
}

export async function call(env, method, p, { body, email, headers = {} } = {}) {
  const init = { method, headers: { 'content-type': 'application/json', ...headers } }
  if (email) init.headers['Cf-Access-JWT-Assertion'] = accessToken(email)
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
  const res = await app.fetch(new Request(`http://local${p}`, init), env)
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, text, json, headers: res.headers }
}

// Ingested signal rows, shaped like worker-ingestion writes them. Each week: [issueCount, cycleDays, completionPct, meetingHours]
export function addLiveTeam(sqlite, id, name, weeks, { cohort = ['6-10 engineers', 'Backend/Platform'], jiraExtra = {}, calendarExtra = {} } = {}) {
  sqlite.prepare('INSERT INTO teams (id, name, size_bucket, function_type, capabilities, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, cohort[0], cohort[1], '[]', Date.now())
  weeks.forEach((w, i) => {
    const iso = `2026-W${String(20 + i).padStart(2, '0')}`
    sqlite.prepare('INSERT INTO signal_weeks (team_id, iso_week, source, payload, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, iso, 'jira', JSON.stringify({ issueCount: w[0], avgCycleTimeDays: w[1], sprintCompletionPct: w[2], ...jiraExtra }), Date.now())
    sqlite.prepare('INSERT INTO signal_weeks (team_id, iso_week, source, payload, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, iso, 'calendar', JSON.stringify({ avgMeetingHoursPerWeek: w[3] ?? 6, ...calendarExtra }), Date.now())
  })
}

// Tiny assertion helper: collects results, prints a summary, sets the exit code.
export function makeSuite(title) {
  const results = []
  return {
    async test(name, fn) {
      try { const detail = await fn(); results.push({ name, ok: true, detail }) } catch (e) { results.push({ name, ok: false, detail: e.message }) }
    },
    done() {
      console.log(`# ${title}`)
      for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`)
      const failed = results.filter((r) => !r.ok).length
      console.log(failed ? `${failed} of ${results.length} FAILED` : `ALL PASSED (${results.length} passed)`)
      process.exit(failed ? 1 : 0)
    },
  }
}
export function assert(cond, msg) { if (!cond) throw new Error(msg) }
