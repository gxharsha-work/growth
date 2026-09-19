import { useState } from 'react'
import { TEAM_IDS, TEAMS } from '../data/roster'
import { useAppStore } from '../store/appStore'
import { getTeamWeek } from '../logic/teamHealth'
import './hud.css'

// Jira/Calendar are "real" for a team once ingestion has run for it (their
// generated JSON rows carry a `details` array); mock teams (Platform,
// Backend) never have one, so this doubles as the real-vs-mock signal.
function JiraDetailsList({ details }) {
  return (
    <ul className="hud-detail-list">
      {details.map((d) => (
        <li key={d.key}>
          <strong>{d.key}</strong> "{d.summary}" — {d.status}
          {d.countsAsDone && ' ✓ counts as done'}
          <br />
          {d.cycleTimeDays !== null
            ? `cycle time: ${d.cycleTimeDays}d${d.isProxy ? ' (still in progress, proxy)' : ''}`
            : `excluded from cycle time: ${d.excludedReason}`}
        </li>
      ))}
    </ul>
  )
}

function CalendarDetailsList({ details }) {
  return (
    <ul className="hud-detail-list">
      {details.map((d, i) => (
        <li key={i}>
          "{d.title}" — {d.included ? `${d.hours}h counted` : `excluded: ${d.reason}`}
        </li>
      ))}
    </ul>
  )
}

function SignalPill({ icon, label, details, renderDetails, expanded, onToggle }) {
  return (
    <div className="hud-signal">
      <button className="hud-signal-toggle" onClick={onToggle}>
        <span className="hud-signal-icon">{icon}</span>
        {label}
        {details && <span className="hud-signal-caret">{expanded ? '▲' : '▼'}</span>}
      </button>
      {expanded && (
        <div className="hud-signal-details">
          {details ? renderDetails(details) : 'Mock data — no per-item breakdown available.'}
        </div>
      )}
    </div>
  )
}

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
        <div className="hud-tabs">
          {TEAM_IDS.map((id) => (
            <button
              key={id}
              className={`hud-tab${currentTeam === id ? ' hud-tab--active' : ''}`}
              onClick={() => setTeam(id)}
            >
              {TEAMS[id].name}
            </button>
          ))}
        </div>
      )}

      {!isCompare && weekHealth && (
        <div className="hud-score">
          <span className="hud-score-value">{weekHealth.score}</span>
          <span className="hud-score-label">
            Health score · Week {weekHealth.week}
          </span>
        </div>
      )}

      {!isCompare && weekHealth && (
        <SignalPill
          icon="🎫"
          label={`Jira: ${weekHealth.signals.jira.avgCycleTimeDays}d cycle · ${weekHealth.signals.jira.sprintCompletionPct}% sprint`}
          details={weekHealth.signals.jira.details}
          renderDetails={(d) => <JiraDetailsList details={d} />}
          expanded={expandedSignal === 'jira'}
          onToggle={() => toggleSignal('jira')}
        />
      )}

      {!isCompare && weekHealth && (
        <SignalPill
          icon="📅"
          label={`Meeting load: ${weekHealth.signals.calendar.avgMeetingHoursPerWeek}h this week`}
          details={weekHealth.signals.calendar.details}
          renderDetails={(d) => <CalendarDetailsList details={d} />}
          expanded={expandedSignal === 'calendar'}
          onToggle={() => toggleSignal('calendar')}
        />
      )}

      <button
        className="hud-compare-toggle"
        onClick={() => setViewMode(isCompare ? 'single' : 'compare')}
      >
        {isCompare ? '← Back to village' : '⇄ Compare teams'}
      </button>

      {!isCompare && (
        <div
          className={`hud-warning-wrap${
            weekHealth?.earlyWarning ? ' hud-warning-wrap--visible' : ''
          }`}
        >
          <div className="hud-warning">
            <span className="hud-warning-icon">⚠️</span>
            <span>Early warning: rising cycle time and workload</span>
          </div>
        </div>
      )}
    </div>
  )
}
