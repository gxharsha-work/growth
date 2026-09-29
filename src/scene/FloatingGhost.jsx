import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useVillageStore } from '../store/villageStore'
import { tileCenter } from './gridUtils'
import CapabilityStructure from './CapabilityStructure'

// Semi-transparent preview that follows the pointer and snaps to the
// nearest tile — used both for a brand-new placement and for moving an
// already-placed building.
export default function FloatingGhost({ teamId }) {
  const groupRef = useRef()
  const placing = useVillageStore((s) => s.placing)
  const draggingId = useVillageStore((s) => s.draggingId)
  const hoveredTile = useVillageStore((s) => s.hoveredTile)
  const buildings = useVillageStore((s) => s.buildingsByTeam[teamId])

  const dragged = draggingId
    ? Object.values(buildings ?? {}).find((b) => b.id === draggingId)
    : null
  const draft = placing ?? (dragged && { archetype: dragged.archetype, name: dragged.name })

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.position.y = 0.14 + Math.sin(clock.elapsedTime * 3) * 0.05
  })

  if (!draft || !hoveredTile) return null
  const [x, z] = tileCenter(hoveredTile.col, hoveredTile.row)

  return (
    <group ref={groupRef} position={[x, 0.14, z]}>
      <CapabilityStructure ghost archetype={draft.archetype} name={draft.name} />
    </group>
  )
}
