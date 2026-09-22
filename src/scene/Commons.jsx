import { useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COMMONS_ID, useVillageStore } from '../store/villageStore'
import { getToonGradient } from './toonGradient'
import KnowledgeGarden from './models/KnowledgeGarden'
import { levelFor } from '../logic/buildingStatus'
import { Sprout } from 'lucide-react'

const PLAZA = '#efe3c8'
const PLAZA_INNER = '#f8f0dc'
const STONE = '#c9c0ae'

export const COMMONS_RADIUS = 2.05

// The one space every team shares: a stone plaza around a living garden.
// It is the hub the paths radiate from, and its vibrancy is the team's code
// review flow — knowledge that is stuck waiting on review literally wilts.
// Not placeable or removable, so there is nothing to manage.
export default function Commons({ weekHealth, interactive = true, showLabel = true }) {
  const gradientMap = getToonGradient()
  const ringRef = useRef()
  const selectedId = useVillageStore((s) => s.selectedId)
  const highlightedId = useVillageStore((s) => s.highlightedId)
  const placing = useVillageStore((s) => s.placing)
  const selectBuilding = useVillageStore((s) => s.selectBuilding)
  const flashBlocked = useVillageStore((s) => s.flashBlocked)

  const active = interactive && (selectedId === COMMONS_ID || highlightedId === COMMONS_ID)
  const vibrancy = weekHealth?.gardenScore ?? 75

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.material.opacity = 0.55 + Math.sin(clock.elapsedTime * 3) * 0.2
      ringRef.current.rotation.z = clock.elapsedTime * 0.4
    }
  })

  const handlePointerDown = (e) => {
    e.stopPropagation()
    if (placing) {
      flashBlocked(3, 3)
      return
    }
    selectBuilding(COMMONS_ID)
  }

  return (
    <group>
      {interactive && (
        <mesh
          position={[0, 0.05, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={handlePointerDown}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <circleGeometry args={[COMMONS_RADIUS, 32]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      <mesh receiveShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[COMMONS_RADIUS, COMMONS_RADIUS + 0.06, 0.1, 40]} />
        <meshToonMaterial color={PLAZA} gradientMap={gradientMap} />
      </mesh>
      <mesh receiveShadow position={[0, 0.105, 0]}>
        <cylinderGeometry args={[1.55, 1.55, 0.02, 36]} />
        <meshToonMaterial color={PLAZA_INNER} gradientMap={gradientMap} />
      </mesh>
      <mesh position={[0, 0.13, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[COMMONS_RADIUS - 0.05, 0.07, 6, 48]} />
        <meshToonMaterial color={STONE} gradientMap={gradientMap} />
      </mesh>

      <KnowledgeGarden vibrancy={vibrancy} position={[0, 0.1, 0]} scale={1.75} />

      {[0, 1, 2, 3].map((k) => {
        const a = Math.PI / 4 + (k * Math.PI) / 2
        return (
          <group key={k} position={[Math.cos(a) * 1.78, 0.1, Math.sin(a) * 1.78]}>
            <mesh castShadow position={[0, 0.36, 0]}>
              <cylinderGeometry args={[0.035, 0.05, 0.72, 6]} />
              <meshToonMaterial color="#5b4636" gradientMap={gradientMap} />
            </mesh>
            <mesh position={[0, 0.78, 0]}>
              <sphereGeometry args={[0.1, 10, 10]} />
              <meshToonMaterial color="#ffd98a" emissive="#ffc857" emissiveIntensity={1} gradientMap={gradientMap} />
            </mesh>
          </group>
        )
      })}

      {active && (
        <mesh ref={ringRef} position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[COMMONS_RADIUS + 0.12, COMMONS_RADIUS + 0.3, 48]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      {showLabel && (
        <Html position={[0, 1.9, 0]} center zIndexRange={[4, 0]} pointerEvents="none">
          <div className={`bldg-label bldg-label--${levelFor(vibrancy)}`} style={{ '--accent': '#4bae5c' }}>
            <span className="bldg-label-badge">
              <Sprout size={13} strokeWidth={2.2} />
            </span>
            <span className="bldg-label-name">Knowledge Commons</span>
            <span className="bldg-label-dot" />
          </div>
        </Html>
      )}
    </group>
  )
}
