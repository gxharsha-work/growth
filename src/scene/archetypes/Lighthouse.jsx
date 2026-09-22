import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mat, Glow, STONE_DARK, WHITE, WOOD_DARK, DARK } from './shared'

const SEGMENTS = [
  { y0: 0.24, h: 0.5, rb: 0.5, rt: 0.43, stripe: false },
  { y0: 0.74, h: 0.45, rb: 0.43, rt: 0.38, stripe: true },
  { y0: 1.19, h: 0.4, rb: 0.38, rt: 0.34, stripe: false },
  { y0: 1.59, h: 0.3, rb: 0.34, rt: 0.31, stripe: true },
]

export default function Lighthouse({ ghost = false, accent }) {
  const beamRef = useRef()
  useFrame(({ clock }) => {
    if (beamRef.current) beamRef.current.rotation.y = clock.elapsedTime * 1.3
  })

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.78, 0.92, 0.24, 9]} />
        <Mat color={STONE_DARK} ghost={ghost} />
      </mesh>
      <mesh castShadow position={[0.55, 0.28, 0.35]} scale={[1, 0.7, 1]}>
        <icosahedronGeometry args={[0.2, 0]} />
        <Mat color="#a3abb8" ghost={ghost} />
      </mesh>
      {SEGMENTS.map((s, i) => (
        <mesh key={i} castShadow position={[0, s.y0 + s.h / 2, 0]}>
          <cylinderGeometry args={[s.rt, s.rb, s.h, 14]} />
          <Mat color={s.stripe ? accent : WHITE} ghost={ghost} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.93, 0]}>
        <cylinderGeometry args={[0.44, 0.4, 0.07, 14]} />
        <Mat color={DARK} ghost={ghost} />
      </mesh>
      <mesh position={[0, 2.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.41, 0.014, 6, 28]} />
        <Mat color="#c9ced8" ghost={ghost} />
      </mesh>
      <mesh position={[0, 2.12, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.3, 12]} />
        <Mat color="#ffe58a" glow={0.9} noTint ghost={ghost} />
      </mesh>
      <mesh castShadow position={[0, 2.42, 0]}>
        <coneGeometry args={[0.3, 0.32, 12]} />
        <Mat color={accent} ghost={ghost} />
      </mesh>
      <mesh position={[0, 2.62, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <Mat color="#ffd166" noTint ghost={ghost} />
      </mesh>
      {/* two rotating light beams, wide end away from the lantern */}
      <group ref={beamRef} position={[0, 2.12, 0]}>
        {[0, Math.PI].map((rot) => (
          <group key={rot} rotation={[0, rot, 0]}>
            <mesh position={[1.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.34, 2.1, 14, 1, true]} />
              <Glow color="#fff3b0" opacity={0.22} ghost={ghost} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0, 0.36, 0.5]}>
        <boxGeometry args={[0.17, 0.28, 0.05]} />
        <Mat color={WOOD_DARK} ghost={ghost} />
      </mesh>
    </group>
  )
}
