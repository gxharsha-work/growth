import { useEffect, useState } from 'react'
import { CircleHelp, X } from 'lucide-react'

// "How to read your village": one plain sentence per element. Each sentence
// matches the rule in src/logic/healthScore.js that drives the visual.
const ITEMS = [
  ['Health score', 'A 0 to 100 score built from the connected signals. A dash means there is not enough data this week.'],
  ['Buildings', "Each building is one of the team's capabilities. Its colour follows how steadily the team is shipping."],
  ['Garden', 'The garden in the middle shows how quickly code reviews come back. It looks faded when the team has no GitHub data.'],
  ['Weather', 'Sun means a score of 80 or more. Clouds mean 60 to 79, or a heavy meeting week. Rain means below 60 or an early warning.'],
  ['Early warning', "A red banner appears when this week's score falls below 85% of the team's own average over the previous 3 weeks."],
]

export default function VillageLegend() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        className="legend-toggle glass"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="village-legend"
        title="How to read your village"
      >
        <CircleHelp size={16} />
        <span className="legend-toggle-text">How to read your village</span>
      </button>
      {open && (
        <div id="village-legend" className="legend-panel glass" role="dialog" aria-label="How to read your village">
          <div className="legend-head">
            <strong>How to read your village</strong>
            <button className="legend-close" onClick={() => setOpen(false)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <dl>
            {ITEMS.map(([term, text]) => (
              <div key={term} className="legend-row">
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  )
}
