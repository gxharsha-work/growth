import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isBuildableTile } from '../store/villageStore'
import { islandRadius, mulberry32, tileCenter, worldToTile } from './gridUtils'
import { getToonGradient } from './toonGradient'
import DecorTree from './models/DecorTree'
import DecorBush from './models/DecorBush'

// A pond in the front-left free corner, spilling over the cliff as a waterfall.
const POND = { x: -7.1, z: 5.3, rx: 1.3, rz: 1.0 }

function nearBuildable(x, z, margin) {
  const { col, row } = worldToTile(x, z)
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (!isBuildableTile(col + dc, row + dr)) continue
      const [cx, cz] = tileCenter(col + dc, row + dr)
      if (Math.abs(x - cx) < 1 + margin && Math.abs(z - cz) < 1 + margin) return true
    }
  }
  return false
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax
  const abz = bz - az
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz)))
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t))
}

const FLOWER_COLORS = ['#ffd166', '#ff8fab', '#ffffff', '#b794f6']

function Flowers({ position, seed }) {
  const gradientMap = getToonGradient()
  const rand = mulberry32(seed)
  return (
    <group position={position}>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[(rand() - 0.5) * 0.7, 0.07, (rand() - 0.5) * 0.7]}>
          <icosahedronGeometry args={[0.065, 0]} />
          <meshToonMaterial color={FLOWER_COLORS[i % FLOWER_COLORS.length]} gradientMap={gradientMap} />
        </mesh>
      ))}
    </group>
  )
}

function Boulder({ position, scale, rot }) {
  const gradientMap = getToonGradient()
  return (
    <mesh castShadow position={position} scale={[scale * 1.2, scale * 0.8, scale]} rotation={[0, rot, 0]}>
      <icosahedronGeometry args={[0.4, 0]} />
      <meshToonMaterial color="#a4a9b3" gradientMap={gradientMap} />
    </mesh>
  )
}

function Waterfall({ x, z, theta }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'rgba(120,205,245,0.55)'
    ctx.fillRect(0, 0, 64, 256)
    const rand = mulberry32(9)
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.5})`
      ctx.fillRect(rand() * 60, rand() * 256, 2 + rand() * 4, 30 + rand() * 90)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(1, 2.4)
    return tex
  }, [])

  useFrame((_, delta) => {
    texture.offset.y += delta * 0.9
  })

  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(Math.cos(theta), Math.sin(theta)), 0]}>
      <mesh position={[0, -4.6, 0.05]}>
        <planeGeometry args={[1.15, 9.2]} />
        <meshBasicMaterial map={texture} transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {[-0.4, 0.3, 0].map((dx, i) => (
        <mesh key={i} position={[dx, -8.8 + i * 0.3, 0.4]} scale={[1.5 + i * 0.3, 0.9, 1.3]}>
          <icosahedronGeometry args={[0.9, 1]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

export default function Decor() {
  const gradientMap = getToonGradient()

  const { scatter, edge, edgeTheta } = useMemo(() => {
    const thetaPond = Math.atan2(POND.z, POND.x)
    const R = islandRadius(thetaPond)
    const edgePoint = { x: Math.cos(thetaPond) * (R - 0.05), z: Math.sin(thetaPond) * (R - 0.05) }

    const rand = mulberry32(2024)
    const items = []
    for (let attempt = 0; attempt < 500 && items.length < 36; attempt++) {
      const theta = rand() * Math.PI * 2
      const r = islandRadius(theta) - 0.8 - rand() * 2.7
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      if (nearBuildable(x, z, 0.4)) continue
      if (Math.hypot(x - POND.x, z - POND.z) < 2.3) continue
      if (distanceToSegment(x, z, POND.x, POND.z, edgePoint.x, edgePoint.z) < 1.1) continue
      if (items.some((it) => Math.hypot(it.x - x, it.z - z) < 1.05)) continue
      const kind = rand()
      items.push({
        x,
        z,
        type: kind < 0.5 ? 'tree' : kind < 0.68 ? 'bush' : kind < 0.8 ? 'rock' : 'flowers',
        scale: 1.05 + rand() * 0.6,
        seed: Math.floor(rand() * 1000),
        rot: rand() * Math.PI,
      })
    }
    return { scatter: items, edge: edgePoint, edgeTheta: thetaPond }
  }, [])

  const creekLength = Math.hypot(edge.x - POND.x, edge.z - POND.z)
  const creekYaw = Math.atan2(edge.x - POND.x, edge.z - POND.z)

  return (
    <group>
      {scatter.map((it, i) => {
        if (it.type === 'tree')
          return <DecorTree key={i} position={[it.x, 0, it.z]} scale={it.scale} swaySeed={it.seed} />
        if (it.type === 'bush')
          return <DecorBush key={i} position={[it.x, 0, it.z]} scale={it.scale * 1.3} />
        if (it.type === 'rock')
          return <Boulder key={i} position={[it.x, 0.14, it.z]} scale={it.scale} rot={it.rot} />
        return <Flowers key={i} position={[it.x, 0, it.z]} seed={it.seed} />
      })}

      {/* pond */}
      <mesh position={[POND.x, 0.01, POND.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[POND.rx + 0.22, POND.rz + 0.22, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshToonMaterial color="#ecdcaa" gradientMap={gradientMap} />
      </mesh>
      <mesh position={[POND.x, 0.02, POND.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[POND.rx, POND.rz, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshToonMaterial color="#56c4f2" gradientMap={gradientMap} />
      </mesh>
      <mesh position={[POND.x + 0.3, 0.03, POND.z - 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.2, 10]} />
        <meshToonMaterial color="#5cb85c" gradientMap={gradientMap} />
      </mesh>
      {/* creek running to the cliff edge */}
      <group
        position={[(POND.x + edge.x) / 2, 0.022, (POND.z + edge.z) / 2]}
        rotation={[0, creekYaw, 0]}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.6, creekLength]} />
          <meshToonMaterial color="#56c4f2" gradientMap={gradientMap} />
        </mesh>
      </group>
      <Waterfall x={edge.x} z={edge.z} theta={edgeTheta} />
    </group>
  )
}
