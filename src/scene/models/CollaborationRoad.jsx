import { useToonGradient } from '../toonGradient'

const PATH_COLOR = '#c9a877'
const PLANK_COLOR = '#a68a5f'
const EDGE_COLOR = '#8fbf5f'

// A short paved path segment — purely decorative for now (no pathfinding),
// meant to sit between two buildings and represent team collaboration /
// dependency health. Low-profile so it reads as ground cover, not a
// building, and doesn't compete visually with anything placed near it.
export default function CollaborationRoad({ ghost = false, ...props }) {
  const gradientMap = useToonGradient()
  const matProps = ghost
    ? { transparent: true, opacity: 0.55, depthWrite: false }
    : {}

  const planks = [-0.5, -0.17, 0.17, 0.5]

  return (
    <group {...props}>
      {/* paved base, flush with the ground */}
      <mesh castShadow={!ghost} receiveShadow={!ghost} position={[0, 0.03, 0]}>
        <boxGeometry args={[1.5, 0.06, 0.7]} />
        <meshToonMaterial
          color={PATH_COLOR}
          gradientMap={gradientMap}
          {...matProps}
        />
      </mesh>
      {/* plank seams for a little texture without extra silhouette */}
      {planks.map((x, i) => (
        <mesh key={i} position={[x, 0.065, 0]}>
          <boxGeometry args={[0.04, 0.01, 0.7]} />
          <meshToonMaterial
            color={PLANK_COLOR}
            gradientMap={gradientMap}
            {...matProps}
          />
        </mesh>
      ))}
      {/* soft grass border on both long edges */}
      {[-0.36, 0.36].map((z, i) => (
        <mesh key={i} position={[0, 0.02, z]}>
          <boxGeometry args={[1.5, 0.03, 0.06]} />
          <meshToonMaterial
            color={EDGE_COLOR}
            gradientMap={gradientMap}
            {...matProps}
          />
        </mesh>
      ))}
    </group>
  )
}
