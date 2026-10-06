// Builds the coaching evidence entirely on the server. The client sends only
// { teamId, week }; everything the model sees is computed here from D1, so a
// stale or hand-edited browser state can never reach the prompt.

import { getSignalsForTeam, type WeekSignals } from './signals'
import { computeHealthScore, isEarlyWarning } from './scoring'
import type { CoachingEvidence } from './coaching'

type TeamRow = { id: string; name: string; size_bucket: string; function_type: string }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// Stable letter for a (team, peer) pair, so the same pair always gets the same
// alias and the alias never reveals the peer's name or id.
function peerAlias(teamId: string, peerId: string): string {
  let h = 0
  for (const ch of `${teamId}|${peerId}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `Peer team ${LETTERS[h % LETTERS.length]}`
}

function aggregateSignals(w: WeekSignals): CoachingEvidence['signals'] {
  return {
    avgCycleTimeDays: w.jira.avgCycleTimeDays,
    sprintCompletionPct: w.jira.sprintCompletionPct,
    avgReviewTurnaroundHours: w.github.avgReviewTurnaroundHours,
    pctCommitsAfter7pm: w.github.pctCommitsAfter7pm,
    avgMeetingHoursPerWeek: w.calendar.avgMeetingHoursPerWeek,
  }
}

// Peer rule: same size bucket AND function type, real (live or hand-tuned)
// data, and data for the same week. Among matches, the smallest team id wins
// so the choice is deterministic. No match -> no peer at all.
async function selectPeer(
  db: D1Database,
  team: TeamRow,
  week: number
): Promise<CoachingEvidence['peer'] | undefined> {
  const { results } = await db
    .prepare(
      'SELECT id, name FROM teams WHERE id != ? AND size_bucket = ? AND function_type = ? ORDER BY id ASC'
    )
    .bind(team.id, team.size_bucket, team.function_type)
    .all<{ id: string; name: string }>()

  for (const candidate of results ?? []) {
    const { weeks, source } = await getSignalsForTeam(db, candidate.id)
    if (source === 'generated') continue
    const peerWeek = weeks[week - 1]
    if (!peerWeek) continue
    const scores = weeks.map((w) => computeHealthScore(w, w.sources))
    return {
      name: peerAlias(team.id, candidate.id),
      score: scores[week - 1],
      signals: aggregateSignals(peerWeek),
    }
  }
  return undefined
}

export async function buildEvidence(
  db: D1Database,
  teamId: string,
  week: number
): Promise<{ evidence: CoachingEvidence; source: string } | null> {
  const team = await db
    .prepare('SELECT id, name, size_bucket, function_type FROM teams WHERE id = ?')
    .bind(teamId)
    .first<TeamRow>()
  if (!team) return null

  const { weeks, source } = await getSignalsForTeam(db, teamId)
  if (!Number.isInteger(week) || week < 1 || week > weeks.length) return null

  const scores = weeks.map((w) => computeHealthScore(w, w.sources))
  const index = week - 1
  const current = weeks[index]
  const previousScore = index > 0 ? scores[index - 1] : scores[index]

  const evidence: CoachingEvidence = {
    team: {
      name: team.name,
      cohort: { sizeBucket: team.size_bucket, functionType: team.function_type },
    },
    week,
    score: scores[index],
    trend: scores[index] - previousScore,
    earlyWarning: isEarlyWarning(scores, index),
    signals: aggregateSignals(current),
    prevSignals: index > 0 ? aggregateSignals(weeks[index - 1]) : null,
    peer: await selectPeer(db, team, week),
  }
  return { evidence, source }
}
