import { useToonGradient } from '../toonGradient'

const STONE_COLOR = '#b9b0a1'
const POST_COLOR = '#7a4a2b'
const ROOF_COLOR = '#c9584a'
const ROPE_COLOR = '#3a2a1a'

// A little wishing well: purely cosmetic landmark for the village.
export default function Landmark({ ghost = false, ...props }) {
  const gradientMap = useToonGradient()
  const matProps = ghost
    ? { transparent: true, opacity: 0.55, depthWrite: false }
    : {}

  return (
    <group {...props}>
      {/* stone base */}
      <mesh castShadow={!ghost} receiveShadow={!ghost} position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.34, 0.38, 0.4, 10]} />
        <meshToonMaterial
          color={STONE_COLOR}
          gradientMap={gradientMap}
          {...matProps}
        />
      </mesh>
      {/* posts */}
      {[
        [0.26, 0, 0],
        [-0.26, 0, 0],
      ].map(([x, , z], i) => (
        <mesh key={i} castShadow={!ghost} position={[x, 0.55, z]}>
          <boxGeometry args={[0.07, 0.5, 0.07]} />
          <meshToonMaterial
            color={POST_COLOR}
            gradientMap={gradientMap}
            {...matProps}
          />
        </mesh>
      ))}
      {/* roof */}
      <mesh
        castShadow={!ghost}
        position={[0, 0.86, 0]}
        rotation={[0, Math.PI / 4, 0]}
      >
        <coneGeometry args={[0.42, 0.3, 4]} />
        <meshToonMaterial
          color={ROOF_COLOR}
          gradientMap={gradientMap}
          {...matProps}
        />
      </mesh>
      {/* little hanging rope + bucket */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.3, 4]} />
        <meshToonMaterial
          color={ROPE_COLOR}
          gradientMap={gradientMap}
          {...matProps}
        />
      </mesh>
      <mesh castShadow={!ghost} position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.08, 0.06, 0.1, 8]} />
        <meshToonMaterial
          color={POST_COLOR}
          gradientMap={gradientMap}
          {...matProps}
        />
      </mesh>
    </group>
  )
}
