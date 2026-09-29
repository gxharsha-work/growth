import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Glow, STONE_DARK, DARK } from './shared'

const BRICK = '#c9704f'
const BRICK_DARK = '#94503a'

export default function Forge({ ghost = false, accent }) {
  const smokeRefs = useRef([])
  const doorMatRef = useRef()

  const gable = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-0.6, 0)
    shape.lineTo(0.6, 0)
    shape.lineTo(0, 0.42)
    shape.closePath()
    return shape
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    smokeRefs.current.forEach((el, i) => {
      if (!el) return
      const phase = (t * 0.35 + i / 3) % 1
      el.position.set(0.03 * Math.sin(phase * 6 + i), phase * 0.9, 0)
      el.scale.setScalar(0.06 + phase * 0.16)
      el.material.opacity = (1 - phase) * 0.6
    })
    if (doorMatRef.current) {
      doorMatRef.current.emissiveIntensity = 0.9 + Math.sin(t * 9) * 0.25 + Math.sin(t * 23) * 0.1
    }
  })

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[1.35, 0.1, 1.12]} />
        <Mat color={STONE_DARK} ghost={ghost} />
      </mesh>
      <mesh castShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[1.15, 0.6, 0.95]} />
        <Mat color={BRICK} ghost={ghost} />
      </mesh>
      {/* gable end walls */}
      {[0.475, -0.475].map((z) => (
        <mesh key={z} position={[0, 0.7, z]}>
          <shapeGeometry args={[gable]} />
          <Mat color={BRICK} side={THREE.DoubleSide} ghost={ghost} />
        </mesh>
      ))}
      {/* roof slabs */}
      {[1, -1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.3, 0.91, 0]} rotation={[0, 0, -s * 0.62]}>
          <boxGeometry args={[0.76, 0.07, 1.08]} />
          <Mat color={accent} ghost={ghost} />
        </mesh>
      ))}
      <mesh position={[0, 1.12, 0]}>
        <boxGeometry args={[0.08, 0.07, 1.12]} />
        <Mat color={DARK} ghost={ghost} />
      </mesh>
      {/* chimney + smoke */}
      <mesh castShadow position={[0.38, 1.1, -0.22]}>
        <boxGeometry args={[0.22, 0.72, 0.22]} />
        <Mat color={BRICK_DARK} ghost={ghost} />
      </mesh>
      <mesh position={[0.38, 1.49, -0.22]}>
        <boxGeometry args={[0.28, 0.06, 0.28]} />
        <Mat color={DARK} ghost={ghost} />
      </mesh>
      {!ghost && (
        <group position={[0.38, 1.55, -0.22]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} ref={(el) => (smokeRefs.current[i] = el)}>
              <icosahedronGeometry args={[1, 1]} />
              <meshBasicMaterial color="#e8e6ee" transparent opacity={0.5} depthWrite={false} userData={{ noTint: true }} />
            </mesh>
          ))}
        </group>
      )}
      {/* furnace mouth, an anvil, and a side window */}
      <mesh position={[-0.18, 0.28, 0.48]}>
        <boxGeometry args={[0.36, 0.3, 0.04]} />
        <meshToonMaterial
          ref={doorMatRef}
          color="#ff9a3d"
          emissive="#ff8a3d"
          emissiveIntensity={0.9}
          transparent={ghost}
          opacity={ghost ? 0.55 : 1}
          userData={{ noTint: true }}
        />
      </mesh>
      <mesh position={[-0.18, 0.28, 0.46]}>
        <boxGeometry args={[0.44, 0.38, 0.03]} />
        <Mat color={DARK} ghost={ghost} />
      </mesh>
      <mesh castShadow position={[0.5, 0.16, 0.72]}>
        <boxGeometry args={[0.14, 0.12, 0.14]} />
        <Mat color={DARK} ghost={ghost} />
      </mesh>
      <mesh castShadow position={[0.5, 0.25, 0.72]}>
        <boxGeometry args={[0.28, 0.07, 0.13]} />
        <Mat color="#525a6b" ghost={ghost} />
      </mesh>
      <mesh position={[0.58, 0.44, 0.1]}>
        <boxGeometry args={[0.02, 0.16, 0.2]} />
        <Glow color="#ffd08a" opacity={0.95} ghost={ghost} />
      </mesh>
    </group>
  )
}
