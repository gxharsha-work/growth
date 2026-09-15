import { BUILDING_TYPES, useVillageStore } from '../store/villageStore'
import { useAppStore } from '../store/appStore'
import './panel.css'

const ICONS = {
  'capability-frontend': '💻',
  'capability-backend': '🗄️',
  'capability-qa': '🔍',
  'capability-devops': '🛠️',
  knowledge: '🌿',
  landmark: '⛲',
  road: '🛤️',
}

const SECTION_LABELS = {
  capability: 'Capability Building',
  village: 'Village',
}

export default function Panel() {
  const currentTeam = useAppStore((s) => s.currentTeam)
  const placingType = useVillageStore((s) => s.placingType)
  const startPlacing = useVillageStore((s) => s.startPlacing)
  const cancelPlacing = useVillageStore((s) => s.cancelPlacing)
  const buildingCount = useVillageStore(
    (s) => Object.keys(s.buildingsByTeam[currentTeam] ?? {}).length
  )

  const handleClick = (id) => {
    if (placingType === id) {
      cancelPlacing()
    } else {
      startPlacing(id)
    }
  }

  let lastCategory = null

  return (
    <aside className="panel">
      <div className="panel-header">
        <span className="panel-title">🌱 Grow your village</span>
        <span className="panel-subtitle">
          {buildingCount === 0
            ? 'Pick a building to place it'
            : `${buildingCount} building${buildingCount === 1 ? '' : 's'} placed`}
        </span>
      </div>

      <div className="panel-list">
        {Object.values(BUILDING_TYPES).map((type) => {
          const active = placingType === type.id
          const showLabel = type.category !== lastCategory
          lastCategory = type.category
          return (
            <div key={type.id} className="panel-item-wrap">
              {showLabel && (
                <span className="panel-section-label">
                  {SECTION_LABELS[type.category] ?? type.category}
                </span>
              )}
              <button
                className={`panel-item${active ? ' panel-item--active' : ''}`}
                onClick={() => handleClick(type.id)}
                style={{ '--swatch': type.color }}
              >
                <span className="panel-icon">{ICONS[type.id]}</span>
                <span className="panel-text">
                  <span className="panel-label">{type.label}</span>
                  <span className="panel-blurb">{type.blurb}</span>
                </span>
                <span className="panel-swatch" />
              </button>
            </div>
          )
        })}
      </div>

      {placingType && (
        <p className="panel-hint">
          Click an empty tile to place it · Esc to cancel
        </p>
      )}
      {!placingType && (
        <p className="panel-hint panel-hint--muted">
          Drag to move · click to view details
        </p>
      )}
    </aside>
  )
}
