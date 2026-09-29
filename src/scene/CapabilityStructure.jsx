import { useLayoutEffect, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ARCHETYPES } from '../data/archetypes'
import { levelFor } from '../logic/buildingStatus'
import ArchetypeGlyph from '../ui/ArchetypeGlyph'
import { ARCHETYPE_MODELS } from './archetypes'
import './scene.css'

function smoothstep(t, edge0, edge1) {
  const x = THREE.MathUtils.clamp((t - edge0) / (edge1 - edge0), 0, 1)
  return x * x * (3 - 2 * x)
}

// Every "solid" material in the model gets a healthy color (as authored)
// and a worn one (desaturated, slightly faded). Lights, flames and glass opt
// out with userData.noTint, so a struggling week dulls the building without
// turning its lantern off.
function collectTintables(root) {
  const found = []
  const seen = new Set()
  root.traverse((obj) => {
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
    for (const mat of mats) {
      if (seen.has(mat) || !mat.color || mat.userData?.noTint) continue
      seen.add(mat)
      const base = mat.color.clone()
      const hsl = { h: 0, s: 0, l: 0 }
      base.getHSL(hsl)
      const worn = new THREE.Color().setHSL(
        hsl.h,
        hsl.s * 0.28,
        THREE.MathUtils.clamp(hsl.l * 0.9 + 0.07, 0, 1)
      )
      found.push({ mat, base, worn })
    }
  })
  return found
}

/**
 * One capability on the island: the shape chosen for it, animated by that
 * week's team health.
 *
 * `healthScore` (0-100) eases the building's height and un-fades its colors,
 * and once it is genuinely strong a few golden sparkles orbit the top.
 * `trend` (this week minus last) adds a little bounce on a meaningful gain
 * or a sag on a drop. Weather stays the scene's primary signal; this is the
 * secondary, per-building detail.
 */
export default function CapabilityStructure({
  archetype = 'lighthouse',
  name = '',
  ghost = false,
  showLabel = true,
  healthScore = 75,
  trend = 0,
}) {
  const info = ARCHETYPES[archetype] ?? ARCHETYPES.lighthouse
  const Model = ARCHETYPE_MODELS[archetype] ?? ARCHETYPE_MODELS.lighthouse

  const modelRef = useRef()
  const scaleRef = useRef()
  const sparkleRef = useRef()
  const tintables = useRef([])
  const smoothed = useRef(healthScore)
  const lastT = useRef(-1)
  const prevTrend = useRef(trend)
  const pulseUntil = useRef(0)
  const pulseSign = useRef(1)

  // re-collect whenever the shape changes (the model remounts under a key)
  useLayoutEffect(() => {
    tintables.current = ghost || !modelRef.current ? [] : collectTintables(modelRef.current)
    lastT.current = -1
  }, [archetype, ghost])

  useLayoutEffect(() => {
    if (Math.abs(trend) > 2 && trend !== prevTrend.current) {
      pulseUntil.current = performance.now() + 500
      pulseSign.current = trend > 0 ? 1 : -1
    }
    prevTrend.current = trend
  }, [trend])

  useFrame(({ clock }) => {
    if (ghost) return
    smoothed.current += (healthScore - smoothed.current) * 0.06
    const t = THREE.MathUtils.clamp(smoothed.current / 100, 0, 1)

    if (Math.abs(t - lastT.current) > 0.002) {
      lastT.current = t
      for (const { mat, base, worn } of tintables.current) {
        mat.color.lerpColors(worn, base, t)
      }
    }

    if (scaleRef.current) {
      const xz = THREE.MathUtils.lerp(0.95, 1.05, t)
      let y = THREE.MathUtils.lerp(0.86, 1.1, t)
      const now = performance.now()
      if (now < pulseUntil.current) {
        const remain = (pulseUntil.current - now) / 500
        y += pulseSign.current * Math.sin(remain * Math.PI) * 0.1
      }
      scaleRef.current.scale.set(xz, y, xz)
    }

    if (sparkleRef.current) {
      const reveal = smoothstep(t, 0.74, 0.92)
      sparkleRef.current.scale.setScalar(reveal)
      sparkleRef.current.rotation.y = clock.elapsedTime * 1.1
      sparkleRef.current.position.y = info.height + 0.25 + Math.sin(clock.elapsedTime * 2) * 0.05
    }
  })

  const level = levelFor(healthScore)

  return (
    <group>
      <group ref={scaleRef}>
        <group ref={modelRef}>
          <Model key={archetype} ghost={ghost} accent={info.color} />
        </group>
      </group>

      {!ghost && (
        <group ref={sparkleRef} position={[0, info.height + 0.25, 0]} scale={0}>
          {[0, 2.1, 4.2].map((a, i) => (
            <mesh key={i} position={[Math.cos(a) * 0.45, (i % 2) * 0.16, Math.sin(a) * 0.45]}>
              <octahedronGeometry args={[0.07, 0]} />
              <meshBasicMaterial color="#ffd54a" />
            </mesh>
          ))}
        </group>
      )}

      {showLabel && !ghost && name && (
        <Html
          position={[0, info.height + 0.75, 0]}
          center
          zIndexRange={[4, 0]}
          pointerEvents="none"
        >
          <div className={`bldg-label bldg-label--${level}`} style={{ '--accent': info.color }}>
            <span className="bldg-label-badge">
              <ArchetypeGlyph id={archetype} size={13} strokeWidth={2} />
            </span>
            <span className="bldg-label-name">{name}</span>
            <span className="bldg-label-dot" />
          </div>
        </Html>
      )}
    </group>
  )
}
