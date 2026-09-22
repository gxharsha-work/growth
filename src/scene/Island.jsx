import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { islandRadius, mulberry32 } from './gridUtils'
import { getToonGradient } from './toonGradient'
import { WEATHER_TRANSITION_RATE } from './GradientSky'

const GRASS = '#7fca57'
const GRASS_LIP = '#5fae45'
const EARTH = '#a9744b'
const ROCK = '#8d7a68'
const ROCK_DARK = '#75655a'

function outline(scale) {
  const shape = new THREE.Shape()
  const steps = 140
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2
    const r = islandRadius(theta) * scale
    // shape-y maps to world -z after the rotation below; negate so the
    // angle used here matches atan2(z, x) everywhere else in the scene
    const x = Math.cos(theta) * r
    const y = -Math.sin(theta) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  return shape
}

// A slab whose TOP face sits at y = 0 and which extends downward.
function slab(scale, depth, bevel) {
  const geo = new THREE.ExtrudeGeometry(outline(scale), {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 1.4,
    bevelSegments: 3,
    curveSegments: 1,
  })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, -(depth + bevel), 0)
  return geo
}

// Faceted hanging rock: a downward cone with jittered, flat-shaded faces.
function rock(radius, height, seed) {
  const rand = mulberry32(seed)
  let geo = new THREE.ConeGeometry(radius, height, 9, 4, true)
  geo.rotateX(Math.PI)
  const pos = geo.attributes.position
  const tipY = -height / 2
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (Math.abs(y - tipY) < 0.001) continue
    const k = 1 + (rand() - 0.5) * 0.3
    pos.setXYZ(i, pos.getX(i) * k, y + (rand() - 0.5) * height * 0.09, pos.getZ(i) * k)
  }
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  return geo
}

const CLOUD_TINT = { sunny: '#ffffff', 'partly-cloudy': '#dfe4e8', rain: '#8a929b' }

// A drifting sea of clouds far below the island, so it reads as floating.
function CloudSea({ weather }) {
  const refs = useRef([])
  const mats = useRef([])
  const tint = useRef(new THREE.Color(CLOUD_TINT.sunny))
  const target = useRef(new THREE.Color(CLOUD_TINT.sunny))

  const clouds = useMemo(() => {
    const rand = mulberry32(77)
    return Array.from({ length: 18 }, () => {
      const angle = rand() * Math.PI * 2
      const dist = 13 + rand() * 20
      return {
        x: Math.cos(angle) * dist,
        y: -6.5 - rand() * 5,
        z: Math.sin(angle) * dist,
        speed: 0.12 + rand() * 0.18,
        puffs: Array.from({ length: 4 }, () => ({
          dx: (rand() - 0.5) * 4.2,
          dz: (rand() - 0.5) * 2.4,
          s: 1.6 + rand() * 1.4,
        })),
      }
    })
  }, [])

  useFrame((_, delta) => {
    target.current.set(CLOUD_TINT[weather] ?? CLOUD_TINT.sunny)
    tint.current.lerp(target.current, Math.min(1, delta * WEATHER_TRANSITION_RATE))
    clouds.forEach((cloud, i) => {
      cloud.x += cloud.speed * delta
      if (cloud.x > 34) cloud.x = -34
      refs.current[i]?.position.set(cloud.x, cloud.y, cloud.z)
    })
    mats.current.forEach((m) => m?.color.copy(tint.current))
  })

  return (
    <group>
      {clouds.map((cloud, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)} position={[cloud.x, cloud.y, cloud.z]}>
          {cloud.puffs.map((p, k) => (
            <mesh key={k} position={[p.dx, 0, p.dz]} scale={[p.s * 1.4, p.s * 0.6, p.s]}>
              <icosahedronGeometry args={[1, 1]} />
              <meshBasicMaterial
                ref={(el) => (mats.current[i * 4 + k] = el)}
                color="#ffffff"
                transparent
                opacity={0.92}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

export default function Island({ weather = 'sunny' }) {
  const gradientMap = getToonGradient()

  const geometry = useMemo(
    () => ({
      grass: slab(1, 0.3, 0.12),
      earth: slab(0.96, 1.1, 0),
      rocks: [
        { geo: rock(8.6, 9.5, 11), height: 9.5, pos: [0, 0], color: ROCK },
        { geo: rock(3.4, 6.2, 23), height: 6.2, pos: [5.2, 2.6], color: ROCK_DARK },
        { geo: rock(3, 5.4, 31), height: 5.4, pos: [-4.8, -3.4], color: ROCK_DARK },
        { geo: rock(2.4, 4.6, 47), height: 4.6, pos: [-1.8, 6], color: ROCK },
        { geo: rock(2.2, 4.2, 59), height: 4.2, pos: [2.4, -6.4], color: ROCK_DARK },
        { geo: rock(1.8, 3.4, 61), height: 3.4, pos: [-6.6, 2.2], color: ROCK },
      ],
      patches: (() => {
        const rand = mulberry32(5)
        return Array.from({ length: 16 }, () => {
          const angle = rand() * Math.PI * 2
          const r = Math.sqrt(rand()) * 9
          return {
            x: Math.cos(angle) * r,
            z: Math.sin(angle) * r,
            sx: 0.9 + rand() * 1.8,
            sz: 0.7 + rand() * 1.3,
            rot: rand() * Math.PI,
            color: rand() > 0.5 ? '#8fd668' : '#72bd4c',
          }
        })
      })(),
    }),
    []
  )

  return (
    <group>
      <mesh geometry={geometry.grass} receiveShadow>
        <meshToonMaterial attach="material-0" color={GRASS} gradientMap={gradientMap} />
        <meshToonMaterial attach="material-1" color={GRASS_LIP} gradientMap={gradientMap} />
      </mesh>
      <mesh geometry={geometry.earth} position={[0, -0.42, 0]} receiveShadow>
        <meshToonMaterial color={EARTH} gradientMap={gradientMap} />
      </mesh>
      {geometry.rocks.map((r, i) => (
        // each cone's base tucks just inside the earth layer (y = -1.3)
        <mesh key={i} geometry={r.geo} position={[r.pos[0], -1.3 - r.height / 2, r.pos[1]]}>
          <meshToonMaterial color={r.color} gradientMap={gradientMap} />
        </mesh>
      ))}
      {/* meadow patches: soft tonal variation so the grass isn't one flat color */}
      {geometry.patches.map((p, i) => (
        <mesh
          key={i}
          position={[p.x, 0.006, p.z]}
          rotation={[-Math.PI / 2, 0, p.rot]}
          scale={[p.sx, p.sz, 1]}
          receiveShadow
        >
          <circleGeometry args={[1, 18]} />
          <meshToonMaterial color={p.color} gradientMap={gradientMap} />
        </mesh>
      ))}
      <CloudSea weather={weather} />
    </group>
  )
}
