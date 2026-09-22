import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Mat, Glow } from './shared'

const SATELLITES = [
  { pos: [0.5, 0.55, 0.15], scale: [0.2, 0.75, 0.2], tilt: [0, 0, -0.35] },
  { pos: [-0.45, 0.5, -0.2], scale: [0.22, 0.65, 0.22], tilt: [0.2, 0, 0.4] },
  { pos: [0.1, 0.42, -0.5], scale: [0.18, 0.55, 0.18], tilt: [-0.4, 0, 0.1] },
  { pos: [-0.2, 0.4, 0.5], scale: [0.16, 0.5, 0.16], tilt: [0.4, 0, -0.1] },
]

export default function Crystal({ ghost = false, accent }) {
  const floatRef = useRef()
  const ringRef = useRef()
  const orbitRef = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (floatRef.current) {
      floatRef.current.position.y = 0.18 + Math.sin(t * 1.4) * 0.06
      floatRef.current.rotation.y = t * 0.5
    }
    if (ringRef.current) ringRef.current.rotation.z = t * 0.6
    if (orbitRef.current) orbitRef.current.rotation.y = -t * 0.9
  })

  const lit = new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.25).getStyle()

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.16, 0]} scale={[1.15, 0.5, 1.15]}>
        <icosahedronGeometry args={[0.6, 0]} />
        <Mat color="#7d8aa8" ghost={ghost} />
      </mesh>
      {SATELLITES.map((s, i) => (
        <mesh key={i} castShadow position={s.pos} rotation={s.tilt} scale={s.scale}>
          <octahedronGeometry args={[0.5, 0]} />
          <Mat color={accent} glow={0.25} ghost={ghost} />
        </mesh>
      ))}
      <group ref={floatRef} position={[0, 0.18, 0]}>
        <mesh castShadow position={[0, 1.0, 0]} scale={[0.6, 1.9, 0.6]}>
          <octahedronGeometry args={[0.5, 0]} />
          <Mat color={lit} glow={0.45} ghost={ghost} />
        </mesh>
      </group>
      <mesh ref={ringRef} position={[0, 1.05, 0]} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[0.78, 0.016, 6, 48]} />
        <Glow color={lit} opacity={0.8} ghost={ghost} />
      </mesh>
      <group ref={orbitRef} position={[0, 1.05, 0]}>
        {[0, 2.1, 4.2].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.78, Math.sin(a * 2) * 0.2, Math.sin(a) * 0.78]}>
            <octahedronGeometry args={[0.06, 0]} />
            <Glow color="#ffffff" opacity={0.95} ghost={ghost} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
