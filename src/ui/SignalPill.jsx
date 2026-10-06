// A static signal pill used by TeamHUD (Jira/Calendar aggregates) and
// ConnectCalendar (the live per-session preview). Per-ticket and per-event
// breakdowns were removed: the API no longer returns raw ticket summaries or
// calendar event titles (they could contain sensitive text), so the pill now
// only shows the aggregate label. An optional trailing node renders a small
// provenance tag.
export function SignalPill({ icon, label, tag }) {
  return (
    <div className="hud-signal">
      <div className="hud-signal-toggle glass hud-signal-static">
        <span className="hud-signal-icon">{icon}</span>
        <span className="hud-signal-label">{label}</span>
        {tag}
      </div>
    </div>
  )
}
