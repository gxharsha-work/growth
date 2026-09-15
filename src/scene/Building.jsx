import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useVillageStore, TILE_SIZE } from '../store/villageStore'
import { tileCenter } from './gridUtils'
import { BUILDING_MODELS, CAPABILITY_TYPE_IDS } from './models'

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

  const Model = BUILDING_MODELS[building.type]
  const [x, z] = tileCenter(building.col, building.row)
  const isBeingDragged = interactive && draggingId === building.id
  const isSelected = interactive && selectedId === building.id

  useFrame(({ clock }) => {
    if (groupRef.current) {
      if (building.justPlaced) {
        if (startTime.current === null) startTime.current = clock.elapsedTime
        const t = Math.min((clock.elapsedTime - startTime.current) / 0.55, 1)
        const s = Math.max(popScale(t), 0)
        groupRef.current.scale.setScalar(s)
      } else {
        groupRef.current.scale.setScalar(1)
      }
    }
    if (ringRef.current) {
      const pulse = 0.55 + Math.sin(clock.elapsedTime * 3) * 0.2
      ringRef.current.material.opacity = pulse
      ringRef.current.rotation.z = clock.elapsedTime * 0.4
    }
  })

  if (isBeingDragged) return null
  if (!Model) return null

  // A plain click (press + release without meaningfully moving the pointer)
  // opens the details popup; moving past the threshold first promotes it to
  // a drag, using the exact same startDragging/Ground drop-off flow as
  // before. While actively placing a *new* building, pressing an existing
  // one keeps the old behavior (pick it up immediately) rather than opening
  // details, so placing mode and details mode never fight each other.
  const handlePointerDown = (e) => {
    e.stopPropagation()
    if (useVillageStore.getState().placingType) {
      startDragging(building.id)
      return
    }

    const start = { x: e.clientX, y: e.clientY }
    pendingClick.current = start

    const onMove = (ev) => {
      if (!pendingClick.current) return
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        pendingClick.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        startDragging(building.id)
      }
    }
    const onUp = () => {
      if (pendingClick.current) {
        selectBuilding(building.id)
      }
      pendingClick.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // health-driven visual props, only meaningful for a couple of building types
  const modelProps = {}
  if (CAPABILITY_TYPE_IDS.includes(building.type)) {
    modelProps.variant = building.type
    if (weekHealth) {
      modelProps.healthScore = weekHealth.capabilityScore
      modelProps.trend = weekHealth.capabilityTrend
    }
  } else if (building.type === 'knowledge' && weekHealth) {
    modelProps.vibrancy = weekHealth.gardenScore
  }

  return (
    <group ref={groupRef} position={[x, 0, z]}>
      {interactive && (
        // invisible full-tile hit area — the visible model is much smaller
        // than a tile, so this makes the whole tile grabbable/clickable
        <mesh
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={handlePointerDown}
          // stop the release here from also reaching Ground's onClick —
          // otherwise Ground's "click empty ground closes the popup" logic
          // would race against selectBuilding() from the same click
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <planeGeometry args={[TILE_SIZE * 0.9, TILE_SIZE * 0.9]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {isSelected && (
        <mesh ref={ringRef} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.78, 0.92, 24]} />
          <meshBasicMaterial
            color="#ffd166"
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      <Model {...modelProps} />
    </group>
  )
}
