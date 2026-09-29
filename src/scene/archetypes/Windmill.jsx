import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mat, STONE, WOOD, WOOD_DARK, CREAM } from './shared'

export default function Windmill({ ghost = false, accent }) {
  const bladesRef = useRef()
  useFrame(({ clock }) => {
    if (bladesRef.current) bladesRef.current.rotation.z = -clock.elapsedTime * 0.9
  })

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.6, 0.66, 0.18, 10]} />
        <Mat color={STONE} ghost={ghost} />
      </mesh>
      <mesh castShadow position={[0, 0.755, 0]}>
        <cylinderGeometry args={[0.3, 0.46, 1.15, 10]} />
        <Mat color={CREAM} ghost={ghost} />
      </mesh>
      <mesh castShadow position={[0, 1.6, 0]}>
        <coneGeometry args={[0.42, 0.55, 10]} />
        <Mat color={accent} ghost={ghost} />
      </mesh>
      <mesh position={[0, 0.4, 0.44]}>
        <boxGeometry args={[0.2, 0.3, 0.05]} />
        <Mat color={WOOD_DARK} ghost={ghost} />
      </mesh>
      <mesh position={[0, 0.85, 0.37]}>
        <boxGeometry args={[0.13, 0.17, 0.04]} />
        <Mat color="#ffe58a" glow={0.6} noTint ghost={ghost} />
      </mesh>
      {/* turning sails */}
      <group position={[0, 1.3, 0.4]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.22, 8]} />
          <Mat color={WOOD} ghost={ghost} />
        </mesh>
        <group ref={bladesRef} position={[0, 0, 0.1]}>
          {[0, 1, 2, 3].map((k) => (
            <group key={k} rotation={[0, 0, (k * Math.PI) / 2]}>
              <mesh castShadow position={[0, 0.42, 0]}>
                <boxGeometry args={[0.06, 0.84, 0.03]} />
                <Mat color={WOOD} ghost={ghost} />
              </mesh>
              <mesh castShadow position={[0.12, 0.5, 0]}>
                <boxGeometry args={[0.2, 0.56, 0.02]} />
                <Mat color={k % 2 ? '#fff6e0' : accent} ghost={ghost} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
      <mesh castShadow position={[0.62, 0.16, 0.25]}>
        <cylinderGeometry args={[0.1, 0.1, 0.22, 8]} />
        <Mat color={WOOD} ghost={ghost} />
      </mesh>
    </group>
  )
}
