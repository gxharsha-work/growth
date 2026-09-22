import { useState } from 'react'
import { Ticket, CalendarDays, ArrowLeftRight, ArrowLeft, TriangleAlert } from 'lucide-react'
import { TEAM_IDS, TEAMS } from '../data/roster'
import { useAppStore } from '../store/appStore'
import { getTeamWeek } from '../logic/teamHealth'
import { levelFor } from '../logic/buildingStatus'
import { SignalPill, JiraDetailsList, CalendarDetailsList } from './SignalPill'
import ConnectCalendar from './ConnectCalendar'
import './hud.css'

const RING_RADIUS = 24
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

export default function TeamHUD() {
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)
  const viewMode = useAppStore((s) => s.viewMode)
  const setTeam = useAppStore((s) => s.setTeam)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const [expandedSignal, setExpandedSignal] = useState(null) // 'jira' | 'calendar' | null

  const weekHealth = getTeamWeek(currentTeam, currentWeek)
  const isCompare = viewMode === 'compare'

  function toggleSignal(name) {
    setExpandedSignal((current) => (current === name ? null : name))
  }

  return (
    <div className="hud">
      {!isCompare && (
        <div className="hud-teams glass" role="tablist" aria-label="Team">
          {TEAM_IDS.map((id) => {
            const row = getTeamWeek(id, currentWeek)
            return (
              <button
                key={id}
                role="tab"
                aria-selected={currentTeam === id}
                className={`hud-team${currentTeam === id ? ' hud-team--active' : ''}`}
                onClick={() => setTeam(id)}
              >
                <span className="hud-team-name">{TEAMS[id].name}</span>
                {row && <span className={`hud-team-score hud-team-score--${levelFor(row.score)}`}>{row.score}</span>}
              </button>
            )
          })}
        </div>
      )}

      {!isCompare && weekHealth && (
        <div className={`hud-score glass hud-score--${levelFor(weekHealth.score)}`}>
          <div className="hud-ring">
            <svg viewBox="0 0 60 60" width="60" height="60">
              <circle className="hud-ring-track" cx="30" cy="30" r={RING_RADIUS} />
              <circle
                className="hud-ring-value"
                cx="30"
                cy="30"
                r={RING_RADIUS}
                strokeDasharray={RING_LENGTH}
                strokeDashoffset={RING_LENGTH * (1 - weekHealth.score / 100)}
              />
            </svg>
            <span className="hud-score-value">{weekHealth.score}</span>
          </div>
          <div className="hud-score-text">
            <span className="hud-score-title">Team health</span>
            <span className="hud-score-label">Week {weekHealth.week}</span>
          </div>
        </div>
      )}

      {!isCompare && weekHealth && (
        <SignalPill
          icon={<Ticket size={15} />}
          label={`Jira: ${weekHealth.signals.jira.avgCycleTimeDays}d cycle · ${weekHealth.signals.jira.sprintCompletionPct}% sprint`}
          details={weekHealth.signals.jira.details}
          renderDetails={(d) => <JiraDetailsList details={d} />}
          expanded={expandedSignal === 'jira'}
          onToggle={() => toggleSignal('jira')}
        />
      )}

      {!isCompare && weekHealth && (
        <SignalPill
          icon={<CalendarDays size={15} />}
          label={`Meeting load: ${weekHealth.signals.calendar.avgMeetingHoursPerWeek}h this week`}
          details={weekHealth.signals.calendar.details}
          renderDetails={(d) => <CalendarDetailsList details={d} />}
          expanded={expandedSignal === 'calendar'}
          onToggle={() => toggleSignal('calendar')}
        />
      )}

      {!isCompare && <ConnectCalendar />}

      <button className="hud-compare-toggle glass" onClick={() => setViewMode(isCompare ? 'single' : 'compare')}>
        {isCompare ? <ArrowLeft size={15} /> : <ArrowLeftRight size={15} />}
        {isCompare ? 'Back to village' : 'Compare teams'}
      </button>

      {!isCompare && (
        <div className={`hud-warning-wrap${weekHealth?.earlyWarning ? ' hud-warning-wrap--visible' : ''}`}>
          <div className="hud-warning">
            <TriangleAlert size={16} />
            <span>Early warning: rising cycle time and workload</span>
          </div>
        </div>
      )}
    </div>
  )
}
