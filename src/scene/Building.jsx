import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useVillageStore, TILE_SIZE } from '../store/villageStore'
import { tileCenter } from './gridUtils'
import CapabilityStructure from './CapabilityStructure'

const DRAG_THRESHOLD_PX = 6

// easeOutBack-ish overshoot so freshly placed buildings feel bouncy
function popScale(t) {
  if (t >= 1) return 1
  const c1 = 1.7
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export default function Building({ building, interactive = true, weekHealth }) {
  const groupRef = useRef()
  const ringRef = useRef()
  const startTime = useRef(null)
  const pendingClick = useRef(null)
  const startDragging = useVillageStore((s) => s.startDragging)
  const selectBuilding = useVillageStore((s) => s.selectBuilding)
  const draggingId = useVillageStore((s) => s.draggingId)
  const selectedId = useVillageStore((s) => s.selectedId)
  const highlightedId = useVillageStore((s) => s.highlightedId)

  const [x, z] = tileCenter(building.col, building.row)
  const isBeingDragged = interactive && draggingId === building.id
  const isSelected = interactive && selectedId === building.id
  const isHighlighted = interactive && highlightedId === building.id

  useFrame(({ clock }) => {
    if (groupRef.current) {
      if (building.justPlaced) {
        if (startTime.current === null) startTime.current = clock.elapsedTime
        const t = Math.min((clock.elapsedTime - startTime.current) / 0.55, 1)
        groupRef.current.scale.setScalar(Math.max(popScale(t), 0))
      } else {
        groupRef.current.scale.setScalar(1)
      }
    }
    if (ringRef.current) {
      ringRef.current.material.opacity = 0.6 + Math.sin(clock.elapsedTime * 3) * 0.2
      ringRef.current.rotation.z = clock.elapsedTime * 0.5
    }
  })

  if (isBeingDragged) return null

  // A plain click (press + release without meaningfully moving the pointer)
  // opens the details popup; moving past the threshold first promotes it to
  // a drag. While actively placing a *new* building, pressing an existing
  // one picks it up immediately so the two modes never fight each other.
  const handlePointerDown = (e) => {
    e.stopPropagation()
    if (useVillageStore.getState().placing) {
      startDragging(building.id)
      return
    }

    const start = { x: e.clientX, y: e.clientY }
    pendingClick.current = start

    const onMove = (ev) => {
      if (!pendingClick.current) return
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > DRAG_THRESHOLD_PX) {
        pendingClick.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        startDragging(building.id)
      }
    }
    const onUp = () => {
      if (pendingClick.current) selectBuilding(building.id)
      pendingClick.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {interactive && (
        // invisible full-tile hit area so the whole tile is grabbable
        <mesh
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={handlePointerDown}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
          // keep the release from also reaching Ground's onClick, which
          // would race selectBuilding() by clearing the selection
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <circleGeometry args={[TILE_SIZE * 0.55, 20]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {(isSelected || isHighlighted) && (
        <mesh ref={ringRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.98, 1.12, 40]} />
          <meshBasicMaterial
            color={isSelected ? '#ffd166' : '#ffffff'}
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      <CapabilityStructure
        archetype={building.archetype}
        name={building.name}
        healthScore={weekHealth?.capabilityScore ?? 75}
        trend={weekHealth?.capabilityTrend ?? 0}
        showLabel
      />
    </group>
  )
}
