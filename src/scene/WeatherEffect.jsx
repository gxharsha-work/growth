import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WEATHER_TRANSITION_RATE } from './GradientSky'

const COUNT = 320
const AREA = 26
const HEIGHT = 11
const FALL_SPEED = 9

// Falling-rain particle effect layered over the whole scene. This is meant
// to be the single most obvious "at a glance" signal as the week scrubber
// moves — sunny/partly-cloudy/rain reads faster than any building detail.
export default function WeatherEffect({ weather = 'sunny' }) {
  const meshRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const smoothedIntensity = useRef(0)

  const drops = useMemo(() => {
    const arr = []
    for (let i = 0; i < COUNT; i++) {
      arr.push({
        x: (Math.random() - 0.5) * AREA,
        y: Math.random() * HEIGHT,
        z: (Math.random() - 0.5) * AREA,
        // each drop "joins" the rain at a different intensity threshold so
        // drops fade in gradually instead of all popping in at once
        threshold: Math.random(),
      })
    }
    return arr
  }, [])

  useFrame((_, delta) => {
    const target = weather === 'rain' ? 1 : 0
    smoothedIntensity.current +=
      (target - smoothedIntensity.current) *
      Math.min(1, delta * WEATHER_TRANSITION_RATE)
    const intensity = smoothedIntensity.current

    const mesh = meshRef.current
    if (!mesh) return

    if (intensity > 0.01) {
      for (const drop of drops) {
        drop.y -= FALL_SPEED * delta
        if (drop.y < 0) drop.y = HEIGHT
      }
    }

    for (let i = 0; i < COUNT; i++) {
      const drop = drops[i]
      const active = intensity > drop.threshold * 0.9
      dummy.position.set(drop.x, drop.y, drop.z)
      dummy.scale.set(1, active ? 1 : 0, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.material.opacity = 0.5 * intensity
    mesh.visible = intensity > 0.01
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, COUNT]}
      frustumCulled={false}
    >
      <cylinderGeometry args={[0.012, 0.012, 0.4, 4]} />
      <meshBasicMaterial
        color="#a9c1de"
        transparent
        opacity={0}
        depthWrite={false}
      />
    </instancedMesh>
  )
}
