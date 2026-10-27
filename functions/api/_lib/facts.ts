// Code computes the comparisons and the signal ranking; the model never does.
// This is the fix for report §3.1 ("wrong key signal", "reversed comparisons"):
// the model guessed which signal mattered and which direction a peer number
// went. Here we rank signals by their actual contribution to the score change
// and compute every peer comparison from the raw numbers, so the only thing
// left for the model is wording (see coaching.ts).

import {
  WEIGHTS,
  normalizeCycleTime,
  normalizeCompletion,
  normalizeReviewTurnaround,
  normalizeAfterHoursCommits,
  normalizeMeetingLoad,
} from './scoring'
import type { CoachingEvidence } from './coaching'
import { PLAYBOOK } from './playbook'

export type Signals = CoachingEvidence['signals']
export type SignalId = 'cycleTime' | 'completion' | 'reviewTurnaround' | 'afterHoursCommits' | 'meetingLoad'
// What a number in the model's wording is allowed to refer to (see validate.ts).
export type NumberField = SignalId | 'score' | 'week'

// The note's STATUS is decided here, in code, from the deterministic flag, the
// trend and the absolute score. The model never writes it (Sprint 5 measured
// the model raising concern on 97% of healthy weeks, and P0-3 still left the
// line to the model with only a prompt rule to guard it).
export type StatusKind = 'concern' | 'low' | 'steady' | 'healthy'
const LOW_SCORE = 45 // same bands as src/logic/buildingStatus.js levelFor
const HEALTHY_SCORE = 70

type Meta = {
  label: string
  weight: number
  get: (s: Signals) => number
  fmt: (v: number) => string
  norm: (v: number) => number
}

const SIGNAL_META: Record<SignalId, Meta> = {
  cycleTime: { label: 'Cycle time', weight: WEIGHTS.cycleTime, get: (s) => s.avgCycleTimeDays, fmt: (v) => `${v.toFixed(1)}d`, norm: normalizeCycleTime },
  completion: { label: 'Sprint completion', weight: WEIGHTS.completion, get: (s) => s.sprintCompletionPct, fmt: (v) => `${Math.round(v)}%`, norm: normalizeCompletion },
  reviewTurnaround: { label: 'Review turnaround', weight: WEIGHTS.reviewTurnaround, get: (s) => s.avgReviewTurnaroundHours, fmt: (v) => `${v.toFixed(1)}h`, norm: normalizeReviewTurnaround },
  afterHoursCommits: { label: 'After-hours commits', weight: WEIGHTS.afterHoursCommits, get: (s) => s.pctCommitsAfter7pm, fmt: (v) => `${Math.round(v)}%`, norm: normalizeAfterHoursCommits },
  meetingLoad: { label: 'Meeting load', weight: WEIGHTS.meetingLoad, get: (s) => s.avgMeetingHoursPerWeek, fmt: (v) => `${v.toFixed(1)}h/wk`, norm: normalizeMeetingLoad },
}

const SIGNAL_IDS = Object.keys(SIGNAL_META) as SignalId[]

export type RankedSignal = {
  id: SignalId
  label: string
  value: number
  display: string
  // weight × (normalized_now − normalized_prev); negative = dragged the score down.
  // When there is no previous week, this is the negative normalized score so the
  // worst current signal still ranks first.
  contribution: number
  peerValue: number | null
  peerDisplay: string | null
  peerDirection: 'higher' | 'lower' | 'same' | null // this team's raw value vs peer's
}

export type Facts = {
  teamName: string
  week: number
  score: number
  trend: number
  trendWord: 'improving' | 'declining' | 'holding steady'
  earlyWarning: boolean
  status: StatusKind // derived in code, never by the model
  statusText: string
  hasPrev: boolean
  peerName: string | null
  ranked: RankedSignal[] // worst-first
  top: RankedSignal
  allowedNumbers: Set<string> // every number the model is allowed to echo (union)
  // Per-field values: a number in the model's wording must match the field it sits next to.
  allowedByField: Record<NumberField, Set<string>>
}

export function deriveStatus(
  score: number,
  earlyWarning: boolean,
  trendWord: Facts['trendWord']
): { kind: StatusKind; text: string } {
  // A small week-to-week dip on a healthy team is noise, not concern; the
  // early-warning rule is the alarm for real drops.
  if (earlyWarning || (trendWord === 'declining' && score < HEALTHY_SCORE)) {
    return { kind: 'concern', text: 'Worth investigating' }
  }
  if (score < LOW_SCORE) return { kind: 'low', text: 'Low score, worth investigating' }
  if (score < HEALTHY_SCORE) return { kind: 'steady', text: 'Holding steady, below target' }
  return { kind: 'healthy', text: 'Looks healthy, stable' }
}

function addNumber(set: Set<string>, value: number) {
  set.add(String(Math.round(value)))
  set.add(value.toFixed(1))
  set.add(String(value))
}

export function computeFacts(ev: CoachingEvidence): Facts {
  const prev = ev.prevSignals ?? null
  const hasPrev = prev != null

  const allowedNumbers = new Set<string>()
  const allowedByField = Object.fromEntries(
    [...SIGNAL_IDS, 'score', 'week'].map((f) => [f, new Set<string>()])
  ) as Record<NumberField, Set<string>>
  const allow = (field: NumberField, value: number) => {
    addNumber(allowedNumbers, value)
    addNumber(allowedByField[field], value)
  }
  allow('score', ev.score)
  allow('week', ev.week)
  if (ev.peer) allow('score', ev.peer.score)

  const ranked: RankedSignal[] = SIGNAL_IDS.map((id) => {
    const meta = SIGNAL_META[id]
    const value = meta.get(ev.signals)
    const normNow = meta.norm(value)
    const contribution = hasPrev
      ? meta.weight * (normNow - meta.norm(meta.get(prev as Signals)))
      : -normNow

    const peerValue = ev.peer ? meta.get(ev.peer.signals) : null
    let peerDirection: RankedSignal['peerDirection'] = null
    if (peerValue != null) {
      peerDirection = value > peerValue ? 'higher' : value < peerValue ? 'lower' : 'same'
    }

    allow(id, value)
    if (peerValue != null) allow(id, peerValue)

    return {
      id,
      label: meta.label,
      value,
      display: meta.fmt(value),
      contribution,
      peerValue,
      peerDisplay: peerValue != null ? meta.fmt(peerValue) : null,
      peerDirection,
    }
  }).sort((a, b) => a.contribution - b.contribution)

  const trendWord: Facts['trendWord'] = ev.trend > 2 ? 'improving' : ev.trend < -2 ? 'declining' : 'holding steady'
  const status = deriveStatus(ev.score, ev.earlyWarning, trendWord)
  return {
    teamName: ev.team.name,
    week: ev.week,
    score: ev.score,
    trend: ev.trend,
    trendWord,
    earlyWarning: ev.earlyWarning,
    status: status.kind,
    statusText: status.text,
    hasPrev,
    peerName: ev.peer?.name ?? null,
    ranked,
    top: ranked[0],
    allowedNumbers,
    allowedByField,
  }
}

// The single code-generated SIGNAL sentence, identical on the model and
// template paths. The peer direction word here is computed from the raw
// numbers in computeFacts, so it can never be reversed by the model.
export function signalSentence(facts: Facts): string {
  const t = facts.top
  // "drop" is only used when the status is actually a concern; a healthy team's
  // routine week-to-week wobble must not read as a drop (Sprint 6 finding D-2).
  const lead = !facts.hasPrev
    ? 'Strongest signal'
    : facts.status === 'concern' && t.contribution < 0
      ? 'Biggest contributor to the drop'
      : t.contribution < 0
        ? 'Biggest week-over-week change'
        : 'Slowest-improving signal'
  const base = `${lead}: ${t.label} (${t.display})`
  if (t.peerDisplay && t.peerDirection && t.peerDirection !== 'same') {
    return `${base}, ${t.peerDirection} than ${facts.peerName}'s ${t.peerDisplay}.`
  }
  if (t.peerDisplay && t.peerDirection === 'same') {
    return `${base}, in line with ${facts.peerName}'s ${t.peerDisplay}.`
  }
  return `${base}.`
}

// The fact sheet handed to the model. It writes only the ACTION line; the
// status, the ranking, the numbers and the peer directions are all decided
// here. The team name is deliberately NOT included: the model does not need it,
// and a user-chosen name inside a prompt is an injection surface.
export function buildFactPrompt(facts: Facts): string {
  const lines = [
    `Week ${facts.week} composite health score: ${facts.score}/100, ${facts.trendWord} vs last week.`,
    `Early-warning state: ${facts.earlyWarning ? 'TRIGGERED' : 'not triggered'}.`,
    `Status (already decided by the system, do not restate or change it): ${facts.statusText}.`,
    '',
    'Signals this week, already ranked by how much each moved the score (worst first):',
    ...facts.ranked.map((s, i) => {
      const peer = s.peerDisplay && s.peerDirection
        ? ` — ${s.peerDirection === 'same' ? 'in line with' : s.peerDirection + ' than'} peer's ${s.peerDisplay}`
        : ''
      return `${i + 1}. ${s.label}: ${s.display}${peer}`
    }),
    '',
    `The most important signal is already decided: ${facts.top.label}. Do not pick a different one.`,
    `Guidance for ${facts.top.label}: ${PLAYBOOK[facts.top.id].guidance}`,
    `Example of the style wanted (adapt it to this situation, keep it specific): ${PLAYBOOK[facts.top.id].step}`,
  ]
  return lines.join('\n')
}
