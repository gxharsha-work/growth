import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useToonGradient } from '../toonGradient'

const TRUNK_COLOR = '#7a4a2b'
const LEAF_COLORS = ['#3f8f3a', '#4fa845', '#5cbf50']

// Decorative pine-style tree: trunk + stacked cone layers.
// Gently sways to keep the village feeling alive.
export default function DecorTree({ scale = 1, swaySeed = 0, ...props }) {
  const gradientMap = useToonGradient()
  const groupRef = useRef()

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.z =
        Math.sin(clock.elapsedTime * 0.9 + swaySeed) * 0.06
      groupRef.current.rotation.x =
        Math.sin(clock.elapsedTime * 0.7 + swaySeed * 1.3) * 0.03
    }
  })

  return (
    <group {...props} scale={scale}>
      <group ref={groupRef} position={[0, 0, 0]}>
        <mesh castShadow position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.05, 0.07, 0.44, 6]} />
          <meshToonMaterial color={TRUNK_COLOR} gradientMap={gradientMap} />
        </mesh>
        {[0.5, 0.72, 0.92].map((y, i) => (
          <mesh key={i} castShadow position={[0, y, 0]}>
            <coneGeometry args={[0.42 - i * 0.1, 0.42, 7]} />
            <meshToonMaterial
              color={LEAF_COLORS[i % LEAF_COLORS.length]}
              gradientMap={gradientMap}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}
