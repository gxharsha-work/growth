import { useState } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { useTeamsStore } from '../store/teamsStore'
import { api } from '../lib/api'
import './coachingNote.css'

// AI coaching suggestion — Sprint 3's documented-but-never-built stage 5
// ("AI Coaching"), sitting strictly above the deterministic score computed
// in src/logic/healthScore.js. This component only ever sends already-
// aggregated, team-level evidence to functions/api/_lib/coaching.ts — never
// raw per-person data. A failure here (Workers AI is an enhancement, not a
// dependency, per the architecture doc) shows an inline error, not a
// broken page — the score/signals above this are unaffected either way.
//
// The API returns a fixed 3-line shape ({status, signal, action}, see
// coaching.ts), rendered as three short labeled rows rather than a
// paragraph — short and scannable enough to fit the HUD's fixed-width
// sidebar without needing to scroll.

export default function CoachingNote({ teamId, weekHealth }) {
  const [phase, setPhase] = useState('idle') // idle | loading | done | error
  const [note, setNote] = useState(null) // { status, signal, action }
  const [error, setError] = useState('')
  const team = useTeamsStore((s) => s.teams[teamId])

  async function handleClick() {
    setPhase('loading')
    setError('')
    try {
      // The server computes score, trend, signals, and peer from { teamId, week }.
      const result = await api.post('/insight', { teamId, week: weekHealth.week })
      setNote(result)
      setPhase('done')
    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }

  if (!team || !weekHealth) return null

  return (
    <div className="coaching-note">
      {phase === 'idle' && (
        <button
          className={`coaching-note-trigger glass${weekHealth.earlyWarning ? ' coaching-note-trigger--warning' : ''}`}
          onClick={handleClick}
        >
          {weekHealth.earlyWarning ? <TriangleAlert size={15} /> : <Sparkles size={15} />}
          Get AI coaching suggestion
        </button>
      )}
      {phase === 'loading' && (
        <div className="coaching-note-card glass coaching-note-card--loading">
          <Sparkles size={15} className="coaching-note-spin" />
          Thinking it through...
        </div>
      )}
      {phase === 'done' && note && (
        <div className="coaching-note-card glass">
          <div className="coaching-note-head">
            <span className="coaching-note-label">
              <Sparkles size={13} /> AI coaching
            </span>
            <button className="coaching-note-reset" onClick={() => setPhase('idle')}>
              Ask again
            </button>
          </div>
          {note.status && <p className="coaching-note-status">{note.status}</p>}
          {note.signal && (
            <p className="coaching-note-row">
              <span>Signal</span>
              {note.signal}
            </p>
          )}
          {note.action && (
            <p className="coaching-note-row">
              <span>Next step</span>
              {note.action}
            </p>
          )}
        </div>
      )}
      {phase === 'error' && (
        <div className="coaching-note-card glass coaching-note-card--error">
          Couldn't generate a suggestion right now ({error}). The score and signals above are unaffected.
        </div>
      )}
    </div>
  )
}
