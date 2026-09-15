import { useToonGradient } from '../toonGradient'

const BUSH_COLOR = '#5aa848'

// Small rounded decorative bush for scattering around the plot edges.
export default function DecorBush({ scale = 1, ...props }) {
  const gradientMap = useToonGradient()
  return (
    <group {...props} scale={scale}>
      <mesh castShadow position={[0, 0.16, 0]}>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshToonMaterial color={BUSH_COLOR} gradientMap={gradientMap} />
      </mesh>
      <mesh castShadow position={[0.14, 0.1, 0.08]} scale={0.7}>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshToonMaterial color={BUSH_COLOR} gradientMap={gradientMap} />
      </mesh>
      <mesh castShadow position={[-0.13, 0.1, -0.06]} scale={0.6}>
        <icosahedronGeometry args={[0.2, 0]} />
        <meshToonMaterial color={BUSH_COLOR} gradientMap={gradientMap} />
      </mesh>
    </group>
  )
}
