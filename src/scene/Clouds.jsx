import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WEATHER_TRANSITION_RATE } from './GradientSky'

const CLOUD_COUNT = 8
// Kept fairly low and close over the village (rather than spread across a
// wide sky dome) so a few are reliably inside the camera's frustum no
// matter which way the village is orbited — a handful of distant, barely
// visible clouds wouldn't read as a signal at all.
const AREA = 26
const MIN_Y = 8
const MAX_Y = 11

// How much of the cloud pool is visible per weather tier — "a few" on
// sunny weeks, denser and more obvious as things worsen.
const DENSITY = { sunny: 0.3, 'partly-cloudy': 0.8, rain: 1 }
const CLOUD_COLOR = {
  sunny: '#ffffff',
  'partly-cloudy': '#ccd2d6',
  rain: '#6d757d',
}

// Soft drifting cloud puffs above the village. Both how many are visible
// and their tint ease toward the current weather state on the same timing
// as the sky/lighting/rain, so the whole scene "rolls in" together.
export default function Clouds({ weather = 'sunny' }) {
  const smoothedDensity = useRef(DENSITY.sunny)
  const smoothedColor = useRef(new THREE.Color(CLOUD_COLOR.sunny))
  const targetColor = useRef(new THREE.Color(CLOUD_COLOR.sunny))
  const cloudOpacity = useRef([])
  const groupRefs = useRef([])
  const matRefs = useRef([])

  const clouds = useMemo(() => {
    const arr = []
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const puffCount = 3 + Math.floor(Math.random() * 2)
      const puffs = Array.from({ length: puffCount }, () => ({
        dx: (Math.random() - 0.5) * 2.4,
        dy: (Math.random() - 0.5) * 0.35,
        dz: (Math.random() - 0.5) * 1.3,
        scale: 0.85 + Math.random() * 0.7,
      }))
      arr.push({
        x: (Math.random() - 0.5) * AREA,
        y: MIN_Y + Math.random() * (MAX_Y - MIN_Y),
        z: (Math.random() - 0.5) * AREA,
        speed: 0.25 + Math.random() * 0.35,
        // each cloud "joins" the sky at a different density threshold, like
        // the raindrops, so clouds fade in gradually rather than all at once
        threshold: Math.random(),
        puffs,
      })
    }
    return arr
  }, [])

  useEffect(() => {
    targetColor.current.set(CLOUD_COLOR[weather] ?? CLOUD_COLOR.sunny)
  }, [weather])

  useFrame((_, delta) => {
    const rate = Math.min(1, delta * WEATHER_TRANSITION_RATE)
    const targetDensity = DENSITY[weather] ?? DENSITY.sunny
    smoothedDensity.current += (targetDensity - smoothedDensity.current) * rate
    smoothedColor.current.lerp(targetColor.current, rate)

    clouds.forEach((cloud, i) => {
      cloud.x += cloud.speed * delta
      if (cloud.x > AREA / 2) cloud.x -= AREA

      const group = groupRefs.current[i]
      if (group) group.position.set(cloud.x, cloud.y, cloud.z)

      const targetOpacity =
        smoothedDensity.current > cloud.threshold * 0.95 ? 0.85 : 0
      cloudOpacity.current[i] = THREE.MathUtils.lerp(
        cloudOpacity.current[i] ?? 0,
        targetOpacity,
        rate
      )

      const mats = matRefs.current[i] ?? []
      mats.forEach((mat) => {
        if (!mat) return
        mat.opacity = cloudOpacity.current[i]
        mat.color.copy(smoothedColor.current)
      })
    })
  })

  return (
    <group>
      {clouds.map((cloud, i) => (
        <group
          key={i}
          ref={(el) => (groupRefs.current[i] = el)}
          position={[cloud.x, cloud.y, cloud.z]}
        >
          {cloud.puffs.map((puff, p) => (
            <mesh
              key={p}
              position={[puff.dx, puff.dy, puff.dz]}
              scale={[puff.scale * 1.3, puff.scale * 0.75, puff.scale]}
            >
              <icosahedronGeometry args={[1, 1]} />
              <meshBasicMaterial
                ref={(el) => {
                  if (!matRefs.current[i]) matRefs.current[i] = []
                  matRefs.current[i][p] = el
                }}
                color={CLOUD_COLOR.sunny}
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
