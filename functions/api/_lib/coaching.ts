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

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8'

export type CoachingEvidence = {
  team: { name: string; cohort: { sizeBucket: string; functionType: string } }
  week: number
  score: number
  trend: number
  earlyWarning: boolean
  signals: {
    avgCycleTimeDays: number
    sprintCompletionPct: number
    avgReviewTurnaroundHours: number
    pctCommitsAfter7pm: number
    avgMeetingHoursPerWeek: number
  }
  peer?: { name: string; score: number; signals: CoachingEvidence['signals'] }
}

function buildPrompt(ev: CoachingEvidence): string {
  const trendWord = ev.trend > 2 ? 'improving' : ev.trend < -2 ? 'declining' : 'holding steady'
  const lines = [
    `Team: ${ev.team.name} (${ev.team.cohort.sizeBucket}, ${ev.team.cohort.functionType})`,
    `Week ${ev.week} composite health score: ${ev.score}/100, ${trendWord} vs last week.`,
    `Early-warning state: ${ev.earlyWarning ? 'TRIGGERED — score dropped meaningfully below this team\'s own trailing baseline' : 'not triggered'}.`,
    `Signals this week:`,
    `- Jira cycle time: ${ev.signals.avgCycleTimeDays.toFixed(1)} days`,
    `- Sprint completion: ${ev.signals.sprintCompletionPct}%`,
    `- Code review turnaround: ${ev.signals.avgReviewTurnaroundHours.toFixed(1)} hours`,
    `- Commits after 7pm: ${ev.signals.pctCommitsAfter7pm}%`,
    `- Meeting load: ${ev.signals.avgMeetingHoursPerWeek.toFixed(1)} hours/week`,
  ]
  if (ev.peer) {
    lines.push(
      '',
      `Anonymized peer comparison (a team in the same size/function cohort, this week):`,
      `- ${ev.peer.name.replace(/team/i, 'Peer Team')}: score ${ev.peer.score}/100, cycle time ${ev.peer.signals.avgCycleTimeDays.toFixed(1)}d, sprint completion ${ev.peer.signals.sprintCompletionPct}%, review turnaround ${ev.peer.signals.avgReviewTurnaroundHours.toFixed(1)}h, meeting load ${ev.peer.signals.avgMeetingHoursPerWeek.toFixed(1)}h/week`
    )
  }
  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a coaching assistant inside Growth, a tool engineering managers use to \
monitor team health. You will be given this week's team-level metrics for ONE team, already \
aggregated — you never see any individual person's data.

Write a short coaching note (3-5 sentences, plain text, no markdown/bullets) for the manager. Rules, \
all mandatory:
1. Only reference numbers and facts given to you below. Never invent a metric, a person, or a cause.
2. Never diagnose burnout, predict attrition, or make any claim about a specific individual — you \
only have team-level aggregates, so there is nothing individual to discuss anyway.
3. Frame everything as "worth investigating" or "worth checking in on," never as a certainty or verdict.
4. Name the ONE or TWO signals that most explain this week's score, using the peer comparison as \
context for whether a number is actually unusual for a team like this, not just different.
5. End with one concrete, low-effort suggested next step for the manager (e.g. a specific question to \
ask in a 1:1, a specific process to review) — not a generic platitude.
6. If early-warning is NOT triggered and the trend is stable or improving, say so plainly and briefly \
instead of manufacturing concern.`

export async function generateCoachingNote(ai: Ai, evidence: CoachingEvidence): Promise<string> {
  const result = await ai.run(MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(evidence) },
    ],
    max_tokens: 220,
  })
  const text = (result as { response?: string }).response
  if (!text) throw new Error('Workers AI returned no response text')
  return text.trim()
}
