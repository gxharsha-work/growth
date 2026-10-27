// Validates the model's wording before it is shown. The model writes only the
// ACTION line (the status, the SIGNAL line and every comparison are
// code-generated), so validation is narrow but strict:
//   - no off-limits language (burnout, attrition, individuals);
//   - length limits;
//   - every number must sit next to the name of a field AND equal that field's
//     value (field-to-value match). The previous check only asked whether the
//     number appeared *anywhere* in the evidence, so a fabricated integer that
//     happened to equal some other value was accepted (Sprint 6 finding D-3:
//     8.7% of random integers passed).
// Anything that fails means the deterministic template note is shown instead.

import type { Facts, NumberField } from './facts'

// Burnout / attrition / individual-level language the Responsible AI rules forbid.
const OFF_LIMITS = /\b(burn ?out|burned out|attrition|quit|quitting|resign|fired|layoff|laid off|leaving the team|flight risk|underperform)\w*/i

export type ValidationResult = { ok: true } | { ok: false; reason: string }

// Names the model may use for each field. A number is bound to the closest
// field name that precedes it.
const FIELD_PATTERNS: [NumberField, RegExp][] = [
  ['cycleTime', /cycle[- ]time/i],
  ['completion', /(?:sprint )?completion/i],
  ['reviewTurnaround', /review (?:turnaround|time|speed)|code reviews?|reviews?/i],
  ['afterHoursCommits', /after[- ]hours(?: commits)?|late[- ]night commits/i],
  ['meetingLoad', /meetings?(?: load| hours)?/i],
  ['score', /(?:health |composite )?score/i],
  ['week', /week/i],
]
const MAX_GAP = 30 // characters between the field name and its number

function boundNumberViolation(text: string, facts: Facts): string | null {
  const numRe = /\d+(?:\.\d+)?/g
  let m: RegExpExecArray | null
  while ((m = numRe.exec(text)) !== null) {
    const before = text.slice(0, m.index)
    let best: { field: NumberField; end: number } | null = null
    for (const [field, pattern] of FIELD_PATTERNS) {
      const g = new RegExp(pattern.source, 'gi')
      let mm: RegExpExecArray | null
      while ((mm = g.exec(before)) !== null) {
        const end = mm.index + mm[0].length
        if (!best || end > best.end) best = { field, end }
      }
    }
    if (!best || m.index - best.end > MAX_GAP) return `number ${m[0]} is not attached to a known field`
    if (!facts.allowedByField[best.field].has(m[0])) {
      return `number ${m[0]} does not match ${best.field}`
    }
  }
  return null
}

export function validateModelWording(
  parts: { action: string; status?: string },
  facts: Facts
): ValidationResult {
  const action = parts.action ?? ''
  const status = parts.status ?? '' // legacy callers; the model no longer writes it
  if (!action.trim()) return { ok: false, reason: 'missing action' }
  if (action.length > 160 || status.length > 80) return { ok: false, reason: 'wording too long' }

  if (OFF_LIMITS.test(`${status} ${action}`)) return { ok: false, reason: 'off-limits language' }

  for (const text of [status, action]) {
    if (!text) continue
    const violation = boundNumberViolation(text, facts)
    if (violation) return { ok: false, reason: violation }
  }
  return { ok: true }
}
