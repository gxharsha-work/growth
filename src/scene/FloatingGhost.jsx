import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useVillageStore } from '../store/villageStore'
import { tileCenter } from './gridUtils'
import { BUILDING_MODELS, CAPABILITY_TYPE_IDS } from './models'

// Semi-transparent preview that follows the pointer and snaps to the
// nearest grid tile — used both for a brand-new placement and for
// re-positioning an already-placed building.
export default function FloatingGhost({ teamId }) {
  const groupRef = useRef()
  const placingType = useVillageStore((s) => s.placingType)
  const draggingId = useVillageStore((s) => s.draggingId)
  const hoveredTile = useVillageStore((s) => s.hoveredTile)
  const buildings = useVillageStore((s) => s.buildingsByTeam[teamId])

  const draggingBuilding = draggingId
    ? Object.values(buildings ?? {}).find((b) => b.id === draggingId)
    : null

  const typeId = placingType || draggingBuilding?.type
  const Model = typeId ? BUILDING_MODELS[typeId] : null

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.position.y = 0.12 + Math.sin(clock.elapsedTime * 3) * 0.04
    const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.03
    groupRef.current.scale.setScalar(pulse)
  })

  if (!Model || !hoveredTile) return null

  const [x, z] = tileCenter(hoveredTile.col, hoveredTile.row)

  const modelProps = CAPABILITY_TYPE_IDS.includes(typeId)
    ? { variant: typeId }
    : {}

  return (
    <group ref={groupRef} position={[x, 0.12, z]}>
      <Model ghost {...modelProps} />
    </group>
  )
}
