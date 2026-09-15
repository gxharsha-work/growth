import { useMemo } from 'react'
import * as THREE from 'three'

// A tiny stepped gradient ramp so MeshToonMaterial gets crisp cel-shading
// bands instead of the smooth default falloff.
export function useToonGradient(steps = 4) {
  return useMemo(() => {
    const data = new Uint8Array(steps)
    for (let i = 0; i < steps; i++) {
      data[i] = Math.round(((i + 1) / steps) * 255)
    }
    const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
    texture.minFilter = THREE.NearestFilter
    texture.magFilter = THREE.NearestFilter
    texture.needsUpdate = true
    return texture
  }, [steps])
}
