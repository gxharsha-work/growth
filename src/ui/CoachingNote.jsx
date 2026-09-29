import { useState } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { useTeamsStore } from '../store/teamsStore'
import { useSignalsStore } from '../store/signalsStore'
import { getTeamWeek } from '../logic/teamHealth'
import { api } from '../lib/api'
import './coachingNote.css'

// AI coaching suggestion — Sprint 3's documented-but-never-built stage 5
// ("AI Coaching"), sitting strictly above the deterministic score computed
// in src/logic/healthScore.js. This component only ever sends already-
// aggregated, team-level evidence to functions/api/_lib/coaching.ts — never
// raw per-person data. A failure here (Workers AI is an enhancement, not a
// dependency, per the architecture doc) shows an inline error, not a
// broken page — the score/signals above this are unaffected either way.

function evidenceSignals(weekHealth) {
  const { jira, github, calendar } = weekHealth.signals
  return {
    avgCycleTimeDays: jira.avgCycleTimeDays,
    sprintCompletionPct: jira.sprintCompletionPct,
    avgReviewTurnaroundHours: github.avgReviewTurnaroundHours,
    pctCommitsAfter7pm: github.pctCommitsAfter7pm,
    avgMeetingHoursPerWeek: calendar.avgMeetingHoursPerWeek,
  }
}

// Same-cohort peer if one's data happens to already be loaded (kept
// zero-friction: this never triggers an extra fetch just to find a peer),
// otherwise any other loaded team, otherwise none — the evidence's `peer`
// field is optional either way.
function findPeer(teamId, currentWeek) {
  const teams = useTeamsStore.getState().teams
  const team = teams[teamId]
  const loaded = useSignalsStore.getState().loadedTeams
  const candidates = Object.values(teams).filter((t) => t.id !== teamId && loaded.has(t.id))
  const sameCohort = team
    ? candidates.find(
        (t) =>
          t.cohort.sizeBucket === team.cohort.sizeBucket &&
          t.cohort.functionType === team.cohort.functionType
      )
    : null
  const peerTeam = sameCohort ?? candidates[0]
  if (!peerTeam) return null
  const peerWeek = getTeamWeek(peerTeam.id, currentWeek)
  if (!peerWeek) return null
  return { name: peerTeam.name, score: peerWeek.score, signals: evidenceSignals(peerWeek) }
}

export default function CoachingNote({ teamId, currentWeek, weekHealth }) {
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const team = useTeamsStore((s) => s.teams[teamId])

  async function handleClick() {
    setStatus('loading')
    setError('')
    try {
      const prevWeek = currentWeek > 0 ? getTeamWeek(teamId, currentWeek - 1) : null
      const evidence = {
        team: { name: team.name, cohort: team.cohort },
        week: weekHealth.week,
        score: weekHealth.score,
        trend: prevWeek ? weekHealth.score - prevWeek.score : 0,
        earlyWarning: weekHealth.earlyWarning,
        signals: evidenceSignals(weekHealth),
        peer: findPeer(teamId, currentWeek) ?? undefined,
      }
      const { text: note } = await api.post('/insight', evidence)
      setText(note)
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  if (!team || !weekHealth) return null

  return (
    <div className="coaching-note">
      {status === 'idle' && (
        <button
          className={`coaching-note-trigger glass${weekHealth.earlyWarning ? ' coaching-note-trigger--warning' : ''}`}
          onClick={handleClick}
        >
          {weekHealth.earlyWarning ? <TriangleAlert size={15} /> : <Sparkles size={15} />}
          Get AI coaching suggestion
        </button>
      )}
      {status === 'loading' && (
        <div className="coaching-note-card glass coaching-note-card--loading">
          <Sparkles size={15} className="coaching-note-spin" />
          Thinking it through...
        </div>
      )}
      {status === 'done' && (
        <div className="coaching-note-card glass">
          <span className="coaching-note-label">
            <Sparkles size={13} /> AI coaching suggestion
          </span>
          <p>{text}</p>
        </div>
      )}
      {status === 'error' && (
        <div className="coaching-note-card glass coaching-note-card--error">
          Couldn't generate a suggestion right now ({error}). The score and signals above are unaffected.
        </div>
      )}
    </div>
  )
}
