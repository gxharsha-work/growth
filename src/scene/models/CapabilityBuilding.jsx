import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useToonGradient } from '../toonGradient'

const WALL_COLOR_GOOD = new THREE.Color('#f3d9a4')
const WALL_COLOR_WORN = new THREE.Color('#bfae94')
const DOOR_COLOR = '#7a4a2b'
const FLAG_POLE_COLOR = '#8a8a8a'
const FLAG_CLOTH_COLOR = '#e0554f'
const PLAQUE_WORN = new THREE.Color('#9c9184')

// The four skill-coverage types share this exact shape — only the roof
// color and a small wall plaque differ, so they read as "one family, four
// flavors" rather than a wall of unrelated buildings (see BUILDING_TYPES in
// store/villageStore.js for where these variant ids come from).
const VARIANTS = {
  'capability-frontend': {
    roofGood: new THREE.Color('#4f8fd1'),
    roofWorn: new THREE.Color('#6d7c8a'),
    plaqueGood: new THREE.Color('#bfe0ff'),
  },
  'capability-backend': {
    roofGood: new THREE.Color('#d9694a'),
    roofWorn: new THREE.Color('#93796a'),
    plaqueGood: new THREE.Color('#f3d9a4'),
  },
  'capability-qa': {
    roofGood: new THREE.Color('#8a63c9'),
    roofWorn: new THREE.Color('#7d7186'),
    plaqueGood: new THREE.Color('#e6d9f7'),
  },
  'capability-devops': {
    roofGood: new THREE.Color('#3fa79a'),
    roofWorn: new THREE.Color('#5f7f7a'),
    plaqueGood: new THREE.Color('#cdeee8'),
  },
}

function smoothstep(t, edge0, edge1) {
  const x = THREE.MathUtils.clamp((t - edge0) / (edge1 - edge0), 0, 1)
  return x * x * (3 - 2 * x)
}

// A little house: box walls + a four-sided pyramid roof + a door + a small
// color-coded wall plaque. Represents a team's skill coverage in a given
// discipline — `variant` (one of the capability-* type ids) picks the roof
// and plaque color; everything else about the shape is shared.
//
// `healthScore` (0-100, from computeCapabilityScore) drives its overall
// condition — subtly taller with a brighter roof in strong weeks, a bit
// smaller and more faded in weak ones, plus a small flag that only flies
// once performance is genuinely strong. This is deliberately kept subtle:
// weather is the scene's primary signal, this is a secondary detail.
// `trend` (this week's capability score minus last week's) triggers a
// little bounce when it meaningfully levels up, or a sag when it declines.
export default function CapabilityBuilding({
  ghost = false,
  healthScore = 75,
  trend = 0,
  variant = 'capability-backend',
  ...groupProps
}) {
  const gradientMap = useToonGradient()
  const wallMatRef = useRef()
  const roofMatRef = useRef()
  const plaqueMatRef = useRef()
  const colors = VARIANTS[variant] ?? VARIANTS['capability-backend']
  const scaleGroupRef = useRef()
  const flagGroupRef = useRef()
  const flagClothRef = useRef()
  const smoothedScore = useRef(healthScore)
  const prevTrend = useRef(trend)
  const pulseUntil = useRef(0)
  const pulseSign = useRef(1)

  useEffect(() => {
    if (trend > 2 && trend !== prevTrend.current) {
      pulseUntil.current = performance.now() + 500
      pulseSign.current = 1
    } else if (trend < -2 && trend !== prevTrend.current) {
      pulseUntil.current = performance.now() + 500
      pulseSign.current = -1
    }
    prevTrend.current = trend
  }, [trend])

  const matProps = ghost
    ? { transparent: true, opacity: 0.55, depthWrite: false }
    : {}

  useFrame(({ clock }) => {
    // ease toward the target score rather than snapping, so scrubbing
    // through weeks reads as an animated transition
    smoothedScore.current += (healthScore - smoothedScore.current) * 0.06
    const t = THREE.MathUtils.clamp(smoothedScore.current / 100, 0, 1)

    if (scaleGroupRef.current) {
      // subtle footprint change, a more pronounced height change — reads
      // as "slightly taller" rather than just "bigger"
      const xz = THREE.MathUtils.lerp(0.92, 1.08, t)
      let y = THREE.MathUtils.lerp(0.86, 1.2, t)
      const now = performance.now()
      if (now < pulseUntil.current) {
        const remain = (pulseUntil.current - now) / 500 // 1 -> 0
        y += pulseSign.current * Math.sin(remain * Math.PI) * 0.12
      }
      scaleGroupRef.current.scale.set(xz, y, xz)
    }
    if (wallMatRef.current) {
      wallMatRef.current.color.lerpColors(WALL_COLOR_WORN, WALL_COLOR_GOOD, t)
    }
    if (roofMatRef.current) {
      roofMatRef.current.color.lerpColors(colors.roofWorn, colors.roofGood, t)
    }
    if (plaqueMatRef.current) {
      plaqueMatRef.current.color.lerpColors(PLAQUE_WORN, colors.plaqueGood, t)
    }
    // the flag only flies once performance is genuinely strong, easing in
    // rather than popping in at a hard cutoff
    if (flagGroupRef.current) {
      const reveal = ghost ? 0 : smoothstep(t, 0.72, 0.92)
      flagGroupRef.current.scale.setScalar(reveal)
    }
    if (flagClothRef.current) {
      flagClothRef.current.rotation.y =
        Math.sin(clock.elapsedTime * 2.4) * 0.3
    }
  })

  return (
    <group {...groupProps}>
      <group ref={scaleGroupRef}>
        {/* walls */}
        <mesh
          castShadow={!ghost}
          receiveShadow={!ghost}
          position={[0, 0.3, 0]}
        >
          <boxGeometry args={[0.95, 0.6, 0.95]} />
          <meshToonMaterial
            ref={wallMatRef}
            color={WALL_COLOR_GOOD}
            gradientMap={gradientMap}
            {...matProps}
          />
        </mesh>
        {/* roof */}
        <mesh
          castShadow={!ghost}
          position={[0, 0.75, 0]}
          rotation={[0, Math.PI / 4, 0]}
        >
          <coneGeometry args={[0.75, 0.55, 4]} />
          <meshToonMaterial
            ref={roofMatRef}
            color={colors.roofGood}
            gradientMap={gradientMap}
            {...matProps}
          />
        </mesh>
        {/* door */}
        <mesh position={[0, 0.18, 0.48]}>
          <boxGeometry args={[0.22, 0.36, 0.04]} />
          <meshToonMaterial
            color={DOOR_COLOR}
            gradientMap={gradientMap}
            {...matProps}
          />
        </mesh>
        {/* small color-coded plaque — the secondary "which variant" cue */}
        <mesh position={[-0.48, 0.36, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <boxGeometry args={[0.22, 0.16, 0.012]} />
          <meshToonMaterial
            ref={plaqueMatRef}
            color={colors.plaqueGood}
            gradientMap={gradientMap}
            {...matProps}
          />
        </mesh>
        {/* little flag — only visible once healthScore is strong */}
        <group ref={flagGroupRef} position={[0, 1.02, 0]} scale={0}>
          <mesh castShadow={!ghost}>
            <cylinderGeometry args={[0.018, 0.018, 0.32, 5]} />
            <meshToonMaterial
              color={FLAG_POLE_COLOR}
              gradientMap={gradientMap}
              {...matProps}
            />
          </mesh>
          <group ref={flagClothRef} position={[0, 0.12, 0]}>
            <mesh position={[0.09, 0, 0]}>
              <boxGeometry args={[0.18, 0.11, 0.012]} />
              <meshToonMaterial
                color={FLAG_CLOTH_COLOR}
                gradientMap={gradientMap}
                side={THREE.DoubleSide}
                {...matProps}
              />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}
