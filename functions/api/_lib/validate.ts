// Validates the model's wording before it is shown. The model only writes
// STATUS and ACTION (the SIGNAL line and all comparisons are code-generated),
// so validation here is narrow but strict: any number the model cites must be
// one that actually appears in the evidence, and it must not use off-limits
// language. Anything that fails means we show the deterministic template note
// instead (report §3.1: "unverified, inconsistent output").

import type { Facts } from './facts'

// Burnout / attrition / individual-level language the Responsible AI rules forbid.
const OFF_LIMITS = /\b(burn ?out|burned out|attrition|quit|quitting|resign|fired|layoff|laid off|leaving the team|flight risk|underperform)\w*/i

export type ValidationResult = { ok: true } | { ok: false; reason: string }

function citedNumbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? []
}

export function validateModelWording(
  parts: { status: string; action: string },
  facts: Facts
): ValidationResult {
  const { status, action } = parts
  if (!status.trim() || !action.trim()) return { ok: false, reason: 'missing status or action' }
  if (status.length > 80 || action.length > 160) return { ok: false, reason: 'status or action too long' }

  const combined = `${status} ${action}`
  if (OFF_LIMITS.test(combined)) return { ok: false, reason: 'off-limits language' }

  // Every number the model echoes must trace back to the evidence.
  for (const n of citedNumbers(combined)) {
    if (!facts.allowedNumbers.has(n)) return { ok: false, reason: `uncited number: ${n}` }
  }
  return { ok: true }
}
