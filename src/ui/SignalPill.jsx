// Shared expandable "pill" used by TeamHUD (Jira/Calendar signals for the
// stored Solstice data) and ConnectCalendar (the live per-session preview)
// — pulled into its own file so the two don't import from each other.

export function JiraDetailsList({ details }) {
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

export function CalendarDetailsList({ details }) {
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

export function SignalPill({ icon, label, details, renderDetails, expanded, onToggle }) {
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
