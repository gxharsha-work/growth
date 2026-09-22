import { Sparkles, Plus } from 'lucide-react'

// Shown when every team has been deleted. "+ New team" in the HUD stays
// available regardless, but this gives the empty canvas its own explicit
// call to action instead of leaving it blank.
export default function EmptyVillageState({ onCreate }) {
  return (
    <div className="empty-village">
      <div className="empty-village-card glass">
        <Sparkles size={22} />
        <strong>Create your first team</strong>
        <span>Teams get their own village, score, and comparison slot.</span>
        <button className="empty-village-cta" onClick={onCreate}>
          <Plus size={15} /> New team
        </button>
      </div>
    </div>
  )
}
