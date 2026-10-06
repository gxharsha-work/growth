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

export type Signals = CoachingEvidence['signals']
export type SignalId = 'cycleTime' | 'completion' | 'reviewTurnaround' | 'afterHoursCommits' | 'meetingLoad'

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
  hasPrev: boolean
  peerName: string | null
  ranked: RankedSignal[] // worst-first
  top: RankedSignal
  allowedNumbers: Set<string> // every number the model is allowed to echo
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
  addNumber(allowedNumbers, ev.score)
  addNumber(allowedNumbers, ev.week)
  if (ev.peer) addNumber(allowedNumbers, ev.peer.score)

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

    addNumber(allowedNumbers, value)
    if (peerValue != null) addNumber(allowedNumbers, peerValue)

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

  return {
    teamName: ev.team.name,
    week: ev.week,
    score: ev.score,
    trend: ev.trend,
    trendWord: ev.trend > 2 ? 'improving' : ev.trend < -2 ? 'declining' : 'holding steady',
    earlyWarning: ev.earlyWarning,
    hasPrev,
    peerName: ev.peer?.name ?? null,
    ranked,
    top: ranked[0],
    allowedNumbers,
  }
}

// The single code-generated SIGNAL sentence, identical on the model and
// template paths. The peer direction word here is computed from the raw
// numbers in computeFacts, so it can never be reversed by the model.
export function signalSentence(facts: Facts): string {
  const t = facts.top
  const lead = facts.earlyWarning || t.contribution < 0 ? 'Biggest contributor to the drop' : 'Strongest signal'
  const base = `${lead}: ${t.label} (${t.display})`
  if (t.peerDisplay && t.peerDirection && t.peerDirection !== 'same') {
    return `${base}, ${t.peerDirection} than ${facts.peerName}'s ${t.peerDisplay}.`
  }
  if (t.peerDisplay && t.peerDirection === 'same') {
    return `${base}, in line with ${facts.peerName}'s ${t.peerDisplay}.`
  }
  return `${base}.`
}

// The fact sheet handed to the model. It writes only STATUS and ACTION; the
// ranking, the numbers, and the peer directions are all decided here.
export function buildFactPrompt(facts: Facts): string {
  const lines = [
    `Team: ${facts.teamName}`,
    `Week ${facts.week} composite health score: ${facts.score}/100, ${facts.trendWord} vs last week.`,
    `Early-warning state: ${facts.earlyWarning ? 'TRIGGERED' : 'not triggered'}.`,
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
  ]
  return lines.join('\n')
}
