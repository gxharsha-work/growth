import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useToonGradient } from '../toonGradient'

const MOUND_COLOR_VIBRANT = new THREE.Color('#8fc25c')
const MOUND_COLOR_WILTED = new THREE.Color('#a9925f')
const BUSH_COLORS_VIBRANT = ['#5fa84a', '#79c25f', '#4e9440'].map(
  (c) => new THREE.Color(c)
)
const BUSH_COLOR_WILTED = new THREE.Color('#8a7a4a')
const SAPLING_COLOR = '#6b4a2b'
const LEAF_COLOR_VIBRANT = new THREE.Color('#8fd66a')
const LEAF_COLOR_WILTED = new THREE.Color('#b8a45a')
const FLOWER_COLORS = ['#ffd166', '#ff8fab']

function smoothstep(t, edge0, edge1) {
  const x = THREE.MathUtils.clamp((t - edge0) / (edge1 - edge0), 0, 1)
  return x * x * (3 - 2 * x)
}

// A little garden mound with clustered bushes and a young sapling.
// Represents shared knowledge growing within the team.
//
// `vibrancy` (0-100, from computeGardenScore — i.e. PR review turnaround)
// drives how full/green vs. wilted/droopy everything looks: slow reviews
// read as "knowledge is bottlenecked", so the garden visibly dries out.
export default function KnowledgeGarden({
  ghost = false,
  vibrancy = 75,
  ...props
}) {
  const gradientMap = useToonGradient()
  const swayRef = useRef()
  const mountRef = useRef()
  const moundMatRef = useRef()
  const leafMatRef = useRef()
  const leafRef = useRef()
  const bushMatRefs = useRef([])
  const bushMeshRefs = useRef([])
  const flowerRefs = useRef([])
  const smoothedVibrancy = useRef(vibrancy)

  const matProps = ghost
    ? { transparent: true, opacity: 0.55, depthWrite: false }
    : {}

  const bushSpots = [
    [0.28, 0.16, 0.18, 0.24],
    [-0.26, 0.14, -0.15, 0.2],
    [0.05, 0.15, -0.28, 0.22],
  ]

  // tiny bloom details that only show up once the garden is genuinely lush
  const flowerSpots = [
    [0.4, 0.2, -0.05],
    [-0.12, 0.19, 0.38],
  ]

  useFrame(({ clock }) => {
    if (swayRef.current) {
      swayRef.current.rotation.z = Math.sin(clock.elapsedTime * 1.4) * 0.05
    }

    smoothedVibrancy.current +=
      (vibrancy - smoothedVibrancy.current) * 0.06
    const t = THREE.MathUtils.clamp(smoothedVibrancy.current / 100, 0, 1)

    if (moundMatRef.current) {
      moundMatRef.current.color.lerpColors(
        MOUND_COLOR_WILTED,
        MOUND_COLOR_VIBRANT,
        t
      )
    }
    bushSpots.forEach(([, , , baseScale], i) => {
      const mat = bushMatRefs.current[i]
      const mesh = bushMeshRefs.current[i]
      if (mat) {
        mat.color.lerpColors(
          BUSH_COLOR_WILTED,
          BUSH_COLORS_VIBRANT[i % BUSH_COLORS_VIBRANT.length],
          t
        )
      }
      if (mesh) {
        // wilted bushes shrink and droop toward the ground a little
        const s = baseScale * THREE.MathUtils.lerp(0.55, 1.05, t)
        mesh.scale.setScalar(s)
        mesh.position.y = THREE.MathUtils.lerp(
          bushSpots[i][1] - 0.06,
          bushSpots[i][1],
          t
        )
      }
    })
    if (leafMatRef.current) {
      leafMatRef.current.color.lerpColors(LEAF_COLOR_WILTED, LEAF_COLOR_VIBRANT, t)
    }
    if (leafRef.current) {
      leafRef.current.scale.setScalar(THREE.MathUtils.lerp(0.7, 1, t))
    }
    if (mountRef.current) {
      // the whole sapling leans over when wilted
      mountRef.current.rotation.x = THREE.MathUtils.lerp(0.5, 0, t)
    }
    // subtle bloom — a couple of tiny flowers that only appear once the
    // garden is genuinely lush, easing in rather than popping on
    const bloom = ghost ? 0 : smoothstep(t, 0.68, 0.9)
    flowerRefs.current.forEach((el) => {
      if (el) el.scale.setScalar(bloom)
    })
  })

  return (
    <group {...props}>
      {/* dirt/grass mound */}
      <mesh
        castShadow={!ghost}
        receiveShadow={!ghost}
        position={[0, 0.06, 0]}
      >
        <cylinderGeometry args={[0.55, 0.6, 0.12, 8]} />
        <meshToonMaterial
          ref={moundMatRef}
          color={MOUND_COLOR_VIBRANT}
          gradientMap={gradientMap}
          {...matProps}
        />
      </mesh>
      {/* clustered bushes */}
      {bushSpots.map(([x, y, z, s], i) => (
        <mesh
          key={i}
          ref={(el) => (bushMeshRefs.current[i] = el)}
          castShadow={!ghost}
          position={[x, y, z]}
          scale={s}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshToonMaterial
            ref={(el) => (bushMatRefs.current[i] = el)}
            color={BUSH_COLORS_VIBRANT[i % BUSH_COLORS_VIBRANT.length]}
            gradientMap={gradientMap}
            {...matProps}
          />
        </mesh>
      ))}
      {/* tiny blooms, only visible once vibrancy is high */}
      {flowerSpots.map(([x, y, z], i) => (
        <mesh
          key={i}
          ref={(el) => (flowerRefs.current[i] = el)}
          position={[x, y, z]}
          scale={0}
        >
          <icosahedronGeometry args={[0.055, 0]} />
          <meshToonMaterial
            color={FLOWER_COLORS[i % FLOWER_COLORS.length]}
            gradientMap={gradientMap}
            {...matProps}
          />
        </mesh>
      ))}
      {/* sapling */}
      <group ref={mountRef} position={[0, 0.12, 0]}>
        <group ref={swayRef}>
          <mesh castShadow={!ghost} position={[0, 0.14, 0]}>
            <cylinderGeometry args={[0.03, 0.04, 0.28, 5]} />
            <meshToonMaterial
              color={SAPLING_COLOR}
              gradientMap={gradientMap}
              {...matProps}
            />
          </mesh>
          <mesh
            ref={leafRef}
            castShadow={!ghost}
            position={[0, 0.34, 0]}
          >
            <icosahedronGeometry args={[0.16, 0]} />
            <meshToonMaterial
              ref={leafMatRef}
              color={LEAF_COLOR_VIBRANT}
              gradientMap={gradientMap}
              {...matProps}
            />
          </mesh>
        </group>
      </group>
    </group>
  )
}
