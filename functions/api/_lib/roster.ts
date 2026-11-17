// Team roster and opt-in consent (FR4, FR18, consent NFR).
//
// Signals are team-level aggregates (Jira and calendar totals), so one
// member's data cannot be removed from a number after the fact. Consent is
// therefore enforced at the team level: a team with live data is scored only
// while at least MIN_CONSENTED members have opted in. Below that, the API
// withholds the team's signals and refuses coaching, and the UI says why.
// 3 is the minimum group size the team decided in Sprint 8 (HANDOFF issue 8).

export const MIN_CONSENTED = 3
export const MAX_IMPORT_ROWS = 200
const MAX_FIELD = 80

export type RosterMember = { id: number; name: string; role: string; consented: boolean }
export type ConsentSummary = { total: number; consented: number; minConsented: number; scoreAllowed: boolean }

type MemberRow = { id: number; name: string; role: string; consented: number }

export async function getRoster(db: D1Database, teamId: string): Promise<RosterMember[]> {
  const { results } = await db
    .prepare('SELECT id, name, role, consented FROM roster_members WHERE team_id = ? ORDER BY name')
    .bind(teamId)
    .all<MemberRow>()
  return (results ?? []).map((r) => ({ id: r.id, name: r.name, role: r.role, consented: r.consented === 1 }))
}

// Live data is about real people, so it needs MIN_CONSENTED opted-in members.
// Demo and generated teams carry synthetic data and are never withheld.
export function summarizeConsent(members: RosterMember[], dataSource: string): ConsentSummary {
  const consented = members.filter((m) => m.consented).length
  return {
    total: members.length,
    consented,
    minConsented: MIN_CONSENTED,
    scoreAllowed: dataSource !== 'live' || consented >= MIN_CONSENTED,
  }
}

// ---------- CSV import ----------
// Header row required: name,role,team,consented (any order, case-insensitive).
// `team` must be this team's id or name. `consented` accepts yes/no, true/false, 1/0.

export type ImportRow = { name: string; role: string; consented: boolean }
export type ImportResult = { rows: ImportRow[]; errors: { line: number; message: string }[] }

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const YES = new Set(['yes', 'y', 'true', '1'])
const NO = new Set(['no', 'n', 'false', '0', ''])

export function parseRosterCsv(csv: string, team: { id: string; name: string }): ImportResult {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/)
  const errors: ImportResult['errors'] = []
  const header = splitCsvLine(lines[0] ?? '').map((h) => h.toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const missing = ['name', 'role', 'team', 'consented'].filter((h) => col(h) < 0)
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `header must include ${missing.join(', ')}` }] }

  const rows: ImportRow[] = []
  const seen = new Set<string>()
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = splitCsvLine(lines[i])
    const name = cells[col('name')] ?? ''
    const role = cells[col('role')] ?? ''
    const teamCell = (cells[col('team')] ?? '').toLowerCase()
    const consentCell = (cells[col('consented')] ?? '').toLowerCase()
    const line = i + 1
    if (!name) { errors.push({ line, message: 'name is empty' }); continue }
    if (name.length > MAX_FIELD || role.length > MAX_FIELD) { errors.push({ line, message: `name and role are limited to ${MAX_FIELD} characters` }); continue }
    if (teamCell !== team.id.toLowerCase() && teamCell !== team.name.toLowerCase()) { errors.push({ line, message: `team "${cells[col('team')]}" is not this team` }); continue }
    if (!YES.has(consentCell) && !NO.has(consentCell)) { errors.push({ line, message: `consented must be yes or no, got "${cells[col('consented')]}"` }); continue }
    if (seen.has(name.toLowerCase())) { errors.push({ line, message: `${name} appears twice` }); continue }
    seen.add(name.toLowerCase())
    rows.push({ name, role, consented: YES.has(consentCell) })
  }
  if (rows.length > MAX_IMPORT_ROWS) return { rows: [], errors: [{ line: 0, message: `at most ${MAX_IMPORT_ROWS} members per import` }] }
  return { rows, errors }
}
