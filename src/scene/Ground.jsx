import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useVillageStore, TILE_SIZE } from '../store/villageStore'
import { tileCenter, worldToTile, GROUND_EXTENT } from './gridUtils'
import { useToonGradient } from './toonGradient'

const GRASS_COLOR = '#7fc95a'

export default function Ground({ teamId, interactive = true }) {
  const gradientMap = useToonGradient()
  const glowRef = useRef()
  const blockedRef = useRef()
  const [hoveredValid, setHoveredValid] = useState(false)

  const placingType = useVillageStore((s) => s.placingType)
  const draggingId = useVillageStore((s) => s.draggingId)
  const hoveredTile = useVillageStore((s) => s.hoveredTile)
  const blockedTile = useVillageStore((s) => s.blockedTile)
  const setHoveredTile = useVillageStore((s) => s.setHoveredTile)
  const placeBuilding = useVillageStore((s) => s.placeBuilding)
  const dropBuilding = useVillageStore((s) => s.dropBuilding)
  const isTileOccupied = useVillageStore((s) => s.isTileOccupied)
  const inBounds = useVillageStore((s) => s.inBounds)
  const clearSelection = useVillageStore((s) => s.clearSelection)

  const handlePointerMove = (e) => {
    e.stopPropagation()
    const { col, row } = worldToTile(e.point.x, e.point.z)
    if (!inBounds(col, row)) {
      setHoveredTile(null)
      return
    }
    const current = useVillageStore.getState().hoveredTile
    if (!current || current.col !== col || current.row !== row) {
      setHoveredTile({ col, row })
    }
  }

  const handlePointerLeave = () => setHoveredTile(null)

  const handleClick = (e) => {
    e.stopPropagation()
    if (!placingType) {
      // clicking empty ground (not placing, not on a building) dismisses
      // an open details popup, same as the X button
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

  const glowPos = useMemo(() => {
    if (!hoveredTile) return null
    const [x, z] = tileCenter(hoveredTile.col, hoveredTile.row)
    return [x, 0.011, z]
  }, [hoveredTile])

  const blockedPos = useMemo(() => {
    if (!blockedTile) return null
    const [col, row] = blockedTile.split(',').map(Number)
    const [x, z] = tileCenter(col, row)
    return [x, 0.012, z]
  }, [blockedTile])

  useFrame(({ clock }) => {
    if (glowRef.current) {
      const pulse = 0.35 + Math.sin(clock.elapsedTime * 4) * 0.12
      glowRef.current.material.opacity = pulse
    }
    if (blockedRef.current) {
      const t = clock.elapsedTime
      blockedRef.current.material.opacity =
        0.55 + Math.sin(t * 30) * 0.25
    }
  })

  useEffect(() => {
    if (!interactive) return
    if (hoveredTile) {
      setHoveredValid(
        !isTileOccupied(teamId, hoveredTile.col, hoveredTile.row, draggingId)
      )
    }
  }, [hoveredTile, isTileOccupied, draggingId, teamId, interactive])

  // outside of placing/dragging, only nudge-highlight empty tiles (per the
  // "hover an empty tile" spec); while actively placing/dragging, also show
  // the red variant over occupied tiles so a blocked target reads early
  const isActive = Boolean(placingType || draggingId)
  const showGlow =
    interactive && Boolean(hoveredTile) && (hoveredValid || isActive)

  const pointerHandlers = interactive
    ? {
        onPointerMove: handlePointerMove,
        onPointerLeave: handlePointerLeave,
        onClick: handleClick,
        onPointerUp: handlePointerUp,
      }
    : {}

  return (
    <group>
      {/* grass base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow {...pointerHandlers}>
        <planeGeometry args={[GROUND_EXTENT + 4, GROUND_EXTENT + 4]} />
        <meshToonMaterial color={GRASS_COLOR} gradientMap={gradientMap} />
      </mesh>

      {/* tile grid lines */}
      <Grid
        position={[0, 0.005, 0]}
        args={[GROUND_EXTENT, GROUND_EXTENT]}
        cellSize={TILE_SIZE}
        cellThickness={1}
        cellColor="#3f7a2e"
        sectionSize={GROUND_EXTENT}
        sectionThickness={1.4}
        sectionColor="#2f5f22"
        fadeDistance={40}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />

      {/* hover glow on an empty tile */}
      {showGlow && glowPos && (
        <mesh ref={glowRef} position={glowPos} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[TILE_SIZE * 0.92, TILE_SIZE * 0.92]} />
          <meshBasicMaterial
            color={hoveredValid ? '#fff4c2' : '#ff6b6b'}
            transparent
            opacity={0.35}
          />
        </mesh>
      )}

      {/* blocked-placement red flash */}
      {interactive && blockedPos && (
        <mesh
          ref={blockedRef}
          position={blockedPos}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[TILE_SIZE * 0.94, TILE_SIZE * 0.94]} />
          <meshBasicMaterial color="#ff3b3b" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  )
}
