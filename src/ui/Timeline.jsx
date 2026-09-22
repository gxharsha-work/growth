import { WEEK_COUNT } from '../data/mockSignals'
import { useAppStore } from '../store/appStore'
import './timeline.css'

export default function Timeline() {
  const currentWeek = useAppStore((s) => s.currentWeek)
  const setWeek = useAppStore((s) => s.setWeek)

  return (
    <div className="timeline glass">
      <div className="timeline-header">
        <span className="timeline-title">Week {currentWeek + 1}</span>
        <span className="timeline-sub">of {WEEK_COUNT}</span>
      </div>
      <input
        className="timeline-slider"
        type="range"
        min={0}
        max={WEEK_COUNT - 1}
        step={1}
        value={currentWeek}
        onChange={(e) => setWeek(Number(e.target.value))}
      />
      <div className="timeline-ticks">
        {Array.from({ length: WEEK_COUNT }, (_, i) => (
          <button
            key={i}
            className={`timeline-tick${i === currentWeek ? ' timeline-tick--active' : ''}`}
            onClick={() => setWeek(i)}
            aria-label={`Week ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  )
}
