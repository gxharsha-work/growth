import { useMemo } from 'react'
import * as THREE from 'three'
import { useVillageStore } from '../store/villageStore'
import { getToonGradient } from './toonGradient'
import { tileCenter } from './gridUtils'
import { COMMONS_RADIUS } from './Commons'

// Flat ribbon that follows a sampled curve.
function ribbonGeometry(points, width) {
  const positions = []
  const indices = []
  const up = new THREE.Vector3(0, 1, 0)
  points.forEach((p, i) => {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const tangent = new THREE.Vector3().subVectors(next, prev).normalize()
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize().multiplyScalar(width / 2)
    positions.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z)
    if (i < points.length - 1) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// Collaboration paths: every capability is linked to the Commons by a soft
// stone path. They are drawn automatically — moving or adding a building
// re-routes them — so there is no separate "road" to place or maintain.
export default function Paths({ teamId }) {
  const gradientMap = getToonGradient()
  const buildings = useVillageStore((s) => s.buildingsByTeam[teamId])
  const draggingId = useVillageStore((s) => s.draggingId)

  const paths = useMemo(() => {
    const result = []
    Object.values(buildings ?? {}).forEach((b, i) => {
      if (b.id === draggingId) return
      const [bx, bz] = tileCenter(b.col, b.row)
      const dist = Math.hypot(bx, bz)
      const dir = new THREE.Vector3(bx / dist, 0, bz / dist)
      const startR = COMMONS_RADIUS - 0.15
      const endR = dist - 0.95
      if (endR - startR < 0.4) return
      const start = dir.clone().multiplyScalar(startR)
      const end = dir.clone().multiplyScalar(endR)
      const bow = (i % 2 ? 1 : -1) * 0.32
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(bow)
      const mid = start.clone().add(end).multiplyScalar(0.5).add(perp)
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
      const pts = curve.getPoints(20)
      result.push({
        key: b.id,
        edge: ribbonGeometry(pts.map((p) => new THREE.Vector3(p.x, 0.022, p.z)), 0.78),
        stone: ribbonGeometry(pts.map((p) => new THREE.Vector3(p.x, 0.034, p.z)), 0.56),
      })
    })
    return result
  }, [buildings, draggingId])

  return (
    <group>
      {paths.map((p) => (
        <group key={p.key}>
          <mesh geometry={p.edge} receiveShadow>
            <meshToonMaterial color="#cdb98f" gradientMap={gradientMap} />
          </mesh>
          <mesh geometry={p.stone} receiveShadow>
            <meshToonMaterial color="#efe2bd" gradientMap={gradientMap} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
