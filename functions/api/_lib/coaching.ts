// AI coaching suggestion — the one piece of Sprint 3's 5-stage pipeline
// ("Data ingestion → health scoring → peer benchmarking → early-warning
// detection → AI coaching") that was documented but never built. Runs on
// Cloudflare Workers AI (free tier), sitting strictly ABOVE the
// deterministic scoring layer (src/logic/healthScore.js / this repo's
// Assignment 3 baseline) as an enhancement, never a dependency: if this
// call fails, the app still shows the full score/trend/signals/early-
// warning state with no narrative — see functions/api/_lib/app.ts's
// /api/insight handler.
//
// The model receives ONLY the structured evidence below — never raw
// per-person ticket/calendar data — and is explicitly instructed to match
// the Sprint 3/4 docs' Responsible AI constraints: ground every claim in
// the evidence given, never invent facts, never diagnose burnout or predict
// attrition, phrase things as worth investigating rather than as verdicts,
// and never make an individual-level claim (the evidence itself is already
// team-level aggregate, so there's nothing individual to leak, but the
// prompt still says so explicitly as a second layer of defense).
//
// Output is a fixed 3-line structure (STATUS/SIGNAL/ACTION), not a free
// paragraph — short enough to fit in the HUD's fixed-width sidebar without
// scrolling, and easy to scan at a glance rather than read like an essay.

import { computeFacts, buildFactPrompt, signalSentence } from './facts'
import { templateNote } from './template'
import { validateModelWording } from './validate'

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8'

export type Signals = {
  avgCycleTimeDays: number
  sprintCompletionPct: number
  avgReviewTurnaroundHours: number
  pctCommitsAfter7pm: number
  avgMeetingHoursPerWeek: number
}

export type CoachingEvidence = {
  team: { name: string; cohort: { sizeBucket: string; functionType: string } }
  week: number
  score: number
  trend: number
  earlyWarning: boolean
  signals: Signals
  prevSignals?: Signals | null // previous week, for ranking the biggest movers
  peer?: { name: string; score: number; signals: Signals }
}

export type CoachingNote = { status: string; signal: string; action: string }
export type GeneratedNote = CoachingNote & { source: 'model' | 'template' }

// Exported for eval/'s harness (functions/api/_lib/app.ts's POST
// /api/eval/insight, driven by scripts/evaluate-coaching.mjs) — evaluation
// tests other prompt/model combinations against the SAME evidence-to-text
// formatting the production path uses, rather than a hand-copied duplicate
// that could quietly drift from what buildPrompt actually does.
// Formats one signal line, or omits it entirely when the value is missing —
// per Sprint 3's own requirement ("Missing or unavailable signals should
// reduce the set of indicators used rather than prevent the system from
// functioning"), which this used to violate: a genuinely missing signal
// (e.g. calendar data not yet synced for a brand-new integration) crashed
// this function outright (`undefined.toFixed is not a function`) before
// the evaluation harness's "calendar unavailable" edge case surfaced it.
function signalLine(label: string, value: number | undefined, format: (v: number) => string): string | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null
  return `- ${label}: ${format(value)}`
}

export function buildPrompt(ev: CoachingEvidence): string {
  const trendWord = ev.trend > 2 ? 'improving' : ev.trend < -2 ? 'declining' : 'holding steady'
  const signalLines = [
    signalLine('Jira cycle time', ev.signals.avgCycleTimeDays, (v) => `${v.toFixed(1)} days`),
    signalLine('Sprint completion', ev.signals.sprintCompletionPct, (v) => `${v}%`),
    signalLine('Code review turnaround', ev.signals.avgReviewTurnaroundHours, (v) => `${v.toFixed(1)} hours`),
    signalLine('Commits after 7pm', ev.signals.pctCommitsAfter7pm, (v) => `${v}%`),
    signalLine('Meeting load', ev.signals.avgMeetingHoursPerWeek, (v) => `${v.toFixed(1)} hours/week`),
  ].filter((line): line is string => line !== null)

  const lines = [
    `Team: ${ev.team.name} (${ev.team.cohort.sizeBucket}, ${ev.team.cohort.functionType})`,
    `Week ${ev.week} composite health score: ${ev.score}/100, ${trendWord} vs last week.`,
    `Early-warning state: ${ev.earlyWarning ? 'TRIGGERED — score dropped meaningfully below this team\'s own trailing baseline' : 'not triggered'}.`,
    `Signals this week:`,
    ...signalLines,
  ]
  if (signalLines.length < 5) {
    lines.push(`(Some signals were unavailable this week and are omitted above — reason only that fewer than five listed.)`)
  }

  if (ev.peer) {
    const peerParts = [
      `score ${ev.peer.score}/100`,
      signalLine('cycle time', ev.peer.signals.avgCycleTimeDays, (v) => `${v.toFixed(1)}d`),
      signalLine('sprint completion', ev.peer.signals.sprintCompletionPct, (v) => `${v}%`),
      signalLine('review turnaround', ev.peer.signals.avgReviewTurnaroundHours, (v) => `${v.toFixed(1)}h`),
      signalLine('meeting load', ev.peer.signals.avgMeetingHoursPerWeek, (v) => `${v.toFixed(1)}h/week`),
    ]
      .filter((p): p is string => p !== null)
      .map((p) => p.replace(/^- /, ''))
      .join(', ')
    lines.push(
      '',
      `Anonymized peer comparison (a team in the same size/function cohort, this week):`,
      `- ${ev.peer.name}: ${peerParts}`
    )
  }
  return lines.join('\n')
}

// The model writes ONLY the wording (STATUS + ACTION). The ranking, the
// numbers, and every peer comparison are decided in code (facts.ts) and the
// SIGNAL line is code-generated, so the model cannot pick the wrong signal or
// reverse a comparison — the two failures the report flagged.
const FACT_SYSTEM_PROMPT = `You are a coaching assistant inside Growth, a tool engineering managers use to \
monitor team health. You are given this week's team metrics, already aggregated and already ranked. \
The single most important signal has already been chosen for you. Your only job is the wording.

Reply with EXACTLY two lines, nothing before or after:
STATUS: <5 words max — the verdict, e.g. "Worth investigating" or "Looks healthy, stable">
ACTION: <under 16 words — one concrete next step for the manager about the most important signal>

Rules, all mandatory:
1. Do NOT include any numbers — the numbers are shown separately.
2. Never mention burnout, attrition, or any individual person — you only have team-level aggregates.
3. Frame any concern as "worth investigating," never as a certainty.
4. If the early-warning state is "not triggered" and the trend is improving or holding steady, \
STATUS must say the team looks healthy — do not manufacture concern.
5. No markdown, no extra lines — exactly the two labeled lines above.`

function parseStatusAction(raw: string): { status: string; action: string } {
  let status = ''
  let action = ''
  for (const line of raw.split('\n')) {
    const m = line.match(/^(STATUS|ACTION)\s*:\s*(.+)$/i)
    if (!m) continue
    if (m[1].toUpperCase() === 'STATUS') status = m[2].trim()
    else action = m[2].trim()
  }
  return { status, action }
}

// Always returns a note. If the AI call fails or its wording doesn't pass
// validation, the deterministic template note is returned instead (source
// says which), so a bad or missing model response degrades to a safe,
// fully-grounded note rather than an error or a misleading claim.
export async function generateCoachingNote(ai: Ai, evidence: CoachingEvidence): Promise<GeneratedNote> {
  const facts = computeFacts(evidence)
  const fallback: GeneratedNote = { ...templateNote(facts), source: 'template' }

  try {
    const result = await ai.run(MODEL, {
      messages: [
        { role: 'system', content: FACT_SYSTEM_PROMPT },
        { role: 'user', content: buildFactPrompt(facts) },
      ],
      max_tokens: 200,
      temperature: 0,
    })
    const text = (result as { response?: string }).response
    if (!text) return fallback

    const parts = parseStatusAction(text)
    const check = validateModelWording(parts, facts)
    if (!check.ok) return fallback

    return { status: parts.status, signal: signalSentence(facts), action: parts.action, source: 'model' }
  } catch {
    return fallback
  }
}
