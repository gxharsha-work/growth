import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vWorldPosition;
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;
  void main() {
    float h = normalize(vWorldPosition + offset).y;
    float t = max(pow(max(h, 0.0), exponent), 0.0);
    gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
  }
`

// Warmer/brighter on sunny weeks, cooler and greyer as weather worsens.
const PALETTES = {
  sunny: { top: '#5fb0ea', bottom: '#fff3d9' },
  'partly-cloudy': { top: '#87a0ae', bottom: '#d9e1e6' },
  rain: { top: '#4c5663', bottom: '#7d8892' },
}

// Shared time-constant for every weather-driven transition (sky, lighting,
// clouds, rain) so the whole scene "rolls in" together over ~1-2 seconds.
export const WEATHER_TRANSITION_RATE = 1.1

// Light-blue-to-white gradient sky on a big inverted sphere. The palette
// eases toward the current weather state rather than snapping, so the
// scrubber's week-to-week transitions feel continuous.
export default function GradientSky({ weather = 'sunny' }) {
  const uniforms = useMemo(
    () => ({
      topColor: { value: new THREE.Color(PALETTES.sunny.top) },
      bottomColor: { value: new THREE.Color(PALETTES.sunny.bottom) },
      offset: { value: 20 },
      exponent: { value: 0.7 },
    }),
    []
  )

  const targetTop = useRef(new THREE.Color(PALETTES.sunny.top))
  const targetBottom = useRef(new THREE.Color(PALETTES.sunny.bottom))

  useEffect(() => {
    const palette = PALETTES[weather] ?? PALETTES.sunny
    targetTop.current.set(palette.top)
    targetBottom.current.set(palette.bottom)
  }, [weather])

  useFrame((_, delta) => {
    const t = Math.min(1, delta * WEATHER_TRANSITION_RATE)
    uniforms.topColor.value.lerp(targetTop.current, t)
    uniforms.bottomColor.value.lerp(targetBottom.current, t)
  })

  return (
    <mesh>
      <sphereGeometry args={[400, 24, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}
