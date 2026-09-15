import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useToonGradient } from '../toonGradient'

const POLE_COLOR = '#8a8a8a'
const CLOTH_COLOR = '#e0554f'

// A small flag/banner post used as decoration around the plot.
export default function Banner({ scale = 1, swaySeed = 0, ...props }) {
  const gradientMap = useToonGradient()
  const clothRef = useRef()

  useFrame(({ clock }) => {
    if (clothRef.current) {
      clothRef.current.rotation.y =
        Math.sin(clock.elapsedTime * 2 + swaySeed) * 0.25
    }
  })

  return (
    <group {...props} scale={scale}>
      <mesh castShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.8, 6]} />
        <meshToonMaterial color={POLE_COLOR} gradientMap={gradientMap} />
      </mesh>
      <group ref={clothRef} position={[0, 0.68, 0]}>
        <mesh castShadow position={[0.15, -0.06, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.015]} />
          <meshToonMaterial
            color={CLOTH_COLOR}
            gradientMap={gradientMap}
            side={2}
          />
        </mesh>
      </group>
    </group>
  )
}
