// Shared expandable "pill" used by TeamHUD (Jira/Calendar signals for the
// stored Solstice data) and ConnectCalendar (the live per-session preview)
// — pulled into its own file so the two don't import from each other.
import { Check, ChevronDown, ChevronUp } from 'lucide-react'

export function JiraDetailsList({ details }) {
  return (
    <ul className="hud-detail-list">
      {details.map((d) => (
        <li key={d.key}>
          <strong>{d.key}</strong> "{d.summary}" &mdash; {d.status}
          {d.countsAsDone && (
            <span className="hud-detail-done">
              <Check size={11} strokeWidth={3} /> counts as done
            </span>
          )}
          <br />
          {d.cycleTimeDays !== null
            ? `cycle time: ${d.cycleTimeDays}d${d.isProxy ? ' (still in progress, proxy)' : ''}`
            : `excluded from cycle time: ${d.excludedReason}`}
        </li>
      ))}
    </ul>
  )
}

export function CalendarDetailsList({ details }) {
  return (
    <ul className="hud-detail-list">
      {details.map((d, i) => (
        <li key={i}>
          "{d.title}" &mdash; {d.included ? `${d.hours}h counted` : `excluded: ${d.reason}`}
        </li>
      ))}
    </ul>
  )
}

export function SignalPill({ icon, label, details, renderDetails, expanded, onToggle }) {
  return (
    <div className="hud-signal">
      <button className="hud-signal-toggle glass" onClick={onToggle}>
        <span className="hud-signal-icon">{icon}</span>
        <span className="hud-signal-label">{label}</span>
        {details && (expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </button>
      {expanded && (
        <div className="hud-signal-details glass">
          {details ? renderDetails(details) : 'Mock data: no per-item breakdown available.'}
        </div>
      )}
    </div>
  )
}
