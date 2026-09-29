import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mat, Glow, STONE_DARK, DARK } from './shared'

export default function Rocket({ ghost = false, accent }) {
  const rocketRef = useRef()
  const flameRef = useRef()
  const steamRefs = useRef([])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (rocketRef.current) rocketRef.current.position.y = 0.3 + Math.sin(t * 1.8) * 0.05
    if (flameRef.current) {
      const flicker = 0.85 + Math.sin(t * 24) * 0.12 + Math.sin(t * 37) * 0.08
      flameRef.current.scale.set(1, flicker, 1)
    }
    steamRefs.current.forEach((el, i) => {
      if (!el) return
      const phase = (t * 0.5 + i / 3) % 1
      const angle = i * 2.1
      el.position.set(Math.cos(angle) * (0.15 + phase * 0.55), 0.06 + phase * 0.25, Math.sin(angle) * (0.15 + phase * 0.55))
      el.scale.setScalar(0.07 + phase * 0.12)
      el.material.opacity = (1 - phase) * 0.55
    })
  })

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.82, 0.88, 0.14, 12]} />
        <Mat color={STONE_DARK} ghost={ghost} />
      </mesh>
      <mesh position={[0, 0.145, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.5, 20]} />
        <Mat color={accent} side={2} ghost={ghost} />
      </mesh>
      {/* gantry */}
      {[0.3, -0.3].map((z) => (
        <mesh key={z} castShadow position={[0.62, 0.9, z]}>
          <boxGeometry args={[0.07, 1.5, 0.07]} />
          <Mat color="#aab1c0" ghost={ghost} />
        </mesh>
      ))}
      {[0.45, 0.9, 1.35].map((y) => (
        <mesh key={y} position={[0.62, y, 0]}>
          <boxGeometry args={[0.06, 0.05, 0.64]} />
          <Mat color="#aab1c0" ghost={ghost} />
        </mesh>
      ))}
      <mesh position={[0.4, 1.1, 0]}>
        <boxGeometry args={[0.42, 0.05, 0.07]} />
        <Mat color={DARK} ghost={ghost} />
      </mesh>
      {/* the rocket itself */}
      <group ref={rocketRef} position={[0, 0.3, 0]}>
        <mesh castShadow position={[0, 0.57, 0]}>
          <cylinderGeometry args={[0.2, 0.21, 0.9, 14]} />
          <Mat color="#f7f9ff" ghost={ghost} />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.212, 0.212, 0.1, 14]} />
          <Mat color={accent} ghost={ghost} />
        </mesh>
        <mesh castShadow position={[0, 1.21, 0]}>
          <coneGeometry args={[0.2, 0.42, 14]} />
          <Mat color={accent} ghost={ghost} />
        </mesh>
        <mesh position={[0, 0.84, 0.19]}>
          <sphereGeometry args={[0.085, 10, 10]} />
          <Mat color="#7dd3fc" glow={0.5} noTint ghost={ghost} />
        </mesh>
        {[0, 1, 2].map((k) => (
          <group key={k} rotation={[0, (k * Math.PI * 2) / 3, 0]}>
            <mesh castShadow position={[0, 0.22, 0.27]} rotation={[0.25, 0, 0]}>
              <boxGeometry args={[0.04, 0.34, 0.2]} />
              <Mat color={accent} ghost={ghost} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.06, 0]}>
          <coneGeometry args={[0.15, 0.14, 12, 1, true]} />
          <Mat color="#525a6b" side={2} ghost={ghost} />
        </mesh>
        <group ref={flameRef} position={[0, -0.02, 0]}>
          <mesh position={[0, -0.16, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.12, 0.38, 10]} />
            <Glow color="#ffab3d" opacity={0.95} ghost={ghost} />
          </mesh>
          <mesh position={[0, -0.1, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.07, 0.24, 10]} />
            <Glow color="#fff1a8" opacity={1} ghost={ghost} />
          </mesh>
        </group>
      </group>
      {!ghost &&
        [0, 1, 2].map((i) => (
          <mesh key={i} ref={(el) => (steamRefs.current[i] = el)}>
            <icosahedronGeometry args={[1, 1]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} userData={{ noTint: true }} />
          </mesh>
        ))}
    </group>
  )
}
