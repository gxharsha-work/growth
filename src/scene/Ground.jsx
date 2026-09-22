import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useVillageStore, listBuildableTiles, tileKey } from '../store/villageStore'
import { tileCenter, worldToTile } from './gridUtils'

// The interactive layer over the island: an invisible plane that turns
// pointer events into tile coordinates, plus the "where can I build" cues.
// There are no grid lines — free spots appear as soft dots only while
// placing or dragging, so the island stays organic the rest of the time.
export default function Ground({ teamId, interactive = true }) {
  const ringRef = useRef()
  const blockedRef = useRef()

  const placing = useVillageStore((s) => s.placing)
  const draggingId = useVillageStore((s) => s.draggingId)
  const hoveredTile = useVillageStore((s) => s.hoveredTile)
  const blockedTile = useVillageStore((s) => s.blockedTile)
  const buildings = useVillageStore((s) => s.buildingsByTeam[teamId])
  const setHoveredTile = useVillageStore((s) => s.setHoveredTile)
  const placeBuilding = useVillageStore((s) => s.placeBuilding)
  const dropBuilding = useVillageStore((s) => s.dropBuilding)
  const isTileOccupied = useVillageStore((s) => s.isTileOccupied)
  const inBounds = useVillageStore((s) => s.inBounds)
  const clearSelection = useVillageStore((s) => s.clearSelection)

  const isActive = Boolean(placing || draggingId)

  const freeTiles = useMemo(
    () =>
      listBuildableTiles().filter(({ col, row }) => {
        const b = buildings?.[tileKey(col, row)]
        return !b || b.id === draggingId
      }),
    [buildings, draggingId]
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ringRef.current) {
      ringRef.current.material.opacity = 0.75 + Math.sin(t * 5) * 0.2
      ringRef.current.rotation.z = t * 0.6
    }
    if (blockedRef.current) blockedRef.current.material.opacity = 0.55 + Math.sin(t * 30) * 0.25
  })

  if (!interactive) return null

  const handlePointerMove = (e) => {
    e.stopPropagation()
    const { col, row } = worldToTile(e.point.x, e.point.z)
    if (!inBounds(col, row)) {
      if (useVillageStore.getState().hoveredTile) setHoveredTile(null)
      return
    }
    const current = useVillageStore.getState().hoveredTile
    if (!current || current.col !== col || current.row !== row) setHoveredTile({ col, row })
  }

  const handleClick = (e) => {
    e.stopPropagation()
    if (!placing) {
      clearSelection()
      return
    }
    const { col, row } = worldToTile(e.point.x, e.point.z)
    placeBuilding(teamId, col, row)
  }

  const handlePointerUp = (e) => {
    if (!draggingId) return
    e.stopPropagation()
    const { col, row } = worldToTile(e.point.x, e.point.z)
    dropBuilding(teamId, col, row)
  }

  const hoverValid =
    hoveredTile && !isTileOccupied(teamId, hoveredTile.col, hoveredTile.row, draggingId)
  const showRing = isActive && hoveredTile
  const blockedPos = blockedTile ? blockedTile.split(',').map(Number) : null
  const [hoverX, hoverZ] = hoveredTile ? tileCenter(hoveredTile.col, hoveredTile.row) : [0, 0]
  const [blockedX, blockedZ] = blockedPos ? tileCenter(blockedPos[0], blockedPos[1]) : [0, 0]

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredTile(null)}
        onClick={handleClick}
        onPointerUp={handlePointerUp}
      >
        <planeGeometry args={[26, 26]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {isActive &&
        freeTiles.map(({ col, row }) => {
          const [x, z] = tileCenter(col, row)
          return (
            <mesh key={tileKey(col, row)} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.13, 14]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} />
            </mesh>
          )
        })}

      {showRing && (
        <group position={[hoverX, 0.05, hoverZ]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.95, 32]} />
            <meshBasicMaterial
              color={hoverValid ? '#ffffff' : '#ff5a5f'}
              transparent
              opacity={0.28}
              depthWrite={false}
            />
          </mesh>
          <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.86, 0.98, 40, 1, 0, Math.PI * 1.7]} />
            <meshBasicMaterial
              color={hoverValid ? '#ffd54a' : '#ff5a5f'}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {blockedPos && (
        <mesh
          ref={blockedRef}
          position={[blockedX, 0.06, blockedZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[1, 32]} />
          <meshBasicMaterial color="#ff3b3b" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
