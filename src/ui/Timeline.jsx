import { WEEK_COUNT } from '../data/mockSignals'
import { useAppStore } from '../store/appStore'
import { useSignalsStore } from '../store/signalsStore'
import { getTeamWeeklyHealth } from '../logic/teamHealth'
import './timeline.css'

function formatRange(startDate, endDate) {
  const opts = { month: 'short', day: 'numeric' }
  const s = new Date(startDate)
  const e = new Date(endDate)
  if (Number.isNaN(s.getTime())) return ''
  const start = s.toLocaleDateString(undefined, opts)
  if (Number.isNaN(e.getTime())) return `from ${start}`
  return `${start} – ${e.toLocaleDateString(undefined, opts)}`
}

export default function Timeline() {
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)
  const setWeek = useAppStore((s) => s.setWeek)
  // re-render once this team's signals finish loading (rows read imperatively)
  useSignalsStore((s) => s.weeklyByTeam[currentTeam])

  const rows = getTeamWeeklyHealth(currentTeam)
  const count = rows.length || WEEK_COUNT
  const index = Math.max(0, Math.min(count - 1, currentWeek))
  const period = rows[index]?.period

  const isSprint = period?.kind === 'sprint'
  const title = isSprint ? period.name || `Sprint ${index + 1}` : `Week ${index + 1}`
  const sub = isSprint
    ? [formatRange(period.startDate, period.endDate), period.state === 'active' ? 'active' : null]
        .filter(Boolean)
        .join(' · ')
    : `of ${count}`

  return (
    <div className="timeline glass">
      <div className="timeline-header">
        <span className="timeline-title">{title}</span>
        <span className="timeline-sub">{sub}</span>
      </div>
      <input
        className="timeline-slider"
        type="range"
        min={0}
        max={Math.max(0, count - 1)}
        step={1}
        value={index}
        onChange={(e) => setWeek(Number(e.target.value))}
      />
      <div className="timeline-ticks">
        {Array.from({ length: count }, (_, i) => {
          const p = rows[i]?.period
          const label = p?.kind === 'sprint' ? p.name || `Sprint ${i + 1}` : `Week ${i + 1}`
          return (
            <button
              key={i}
              className={`timeline-tick${i === index ? ' timeline-tick--active' : ''}`}
              onClick={() => setWeek(i)}
              aria-label={label}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
