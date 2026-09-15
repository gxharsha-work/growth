import { TEAM_IDS, TEAMS } from '../data/roster'
import { useAppStore } from '../store/appStore'
import { getTeamWeek } from '../logic/teamHealth'
import './hud.css'

export default function TeamHUD() {
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)
  const viewMode = useAppStore((s) => s.viewMode)
  const setTeam = useAppStore((s) => s.setTeam)
  const setViewMode = useAppStore((s) => s.setViewMode)

  const weekHealth = getTeamWeek(currentTeam, currentWeek)
  const isCompare = viewMode === 'compare'

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
