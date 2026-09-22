import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mat, STONE, DARK } from './shared'

export default function Observatory({ ghost = false, accent }) {
  const domeRef = useRef()
  const starRefs = useRef([])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // the dome slowly sweeps, as if tracking something across the sky
    if (domeRef.current) domeRef.current.rotation.y = Math.sin(t * 0.35) * 0.9
    starRefs.current.forEach((el, i) => {
      if (el) el.scale.setScalar(0.7 + Math.sin(t * 2.4 + i * 1.7) * 0.35)
    })
  })

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.62, 0.68, 0.7, 14]} />
        <Mat color="#f1ecf9" ghost={ghost} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.66, 0.66, 0.07, 14]} />
        <Mat color="#f2c14e" ghost={ghost} />
      </mesh>
      <group ref={domeRef} position={[0, 0.74, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.62, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <Mat color={accent} ghost={ghost} />
        </mesh>
        <mesh position={[0, 0.31, 0.33]} rotation={[-0.78, 0, 0]}>
          <boxGeometry args={[0.15, 0.72, 0.1]} />
          <Mat color={DARK} ghost={ghost} />
        </mesh>
        <mesh position={[0, 0.42, 0.55]} rotation={[0.85, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.62, 10]} />
          <Mat color="#dcd6ea" ghost={ghost} />
        </mesh>
        <mesh position={[0, 0.66, 0.74]} rotation={[0.85, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.07, 0.06, 10]} />
          <Mat color="#9fe7ff" glow={0.6} noTint ghost={ghost} />
        </mesh>
      </group>
      <mesh position={[0, 0.2, 0.64]}>
        <boxGeometry args={[0.2, 0.36, 0.05]} />
        <Mat color={DARK} ghost={ghost} />
      </mesh>
      <mesh position={[0, 0.04, 0.78]}>
        <boxGeometry args={[0.4, 0.08, 0.22]} />
        <Mat color={STONE} ghost={ghost} />
      </mesh>
      {!ghost &&
        [
          [-0.85, 1.65, 0.1],
          [0.8, 1.9, -0.3],
          [0.15, 2.05, 0.7],
        ].map((p, i) => (
          <mesh key={i} ref={(el) => (starRefs.current[i] = el)} position={p}>
            <octahedronGeometry args={[0.07, 0]} />
            <meshBasicMaterial color="#ffe58a" userData={{ noTint: true }} />
          </mesh>
        ))}
    </group>
  )
}
