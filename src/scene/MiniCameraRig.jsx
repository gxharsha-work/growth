import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

const RADIUS = 23
const HEIGHT = 15

// Fixed, gently auto-rotating camera for the read-only peer comparison
// mini-villages — no OrbitControls, nothing for the viewer to fight with.
export default function MiniCameraRig() {
  const { camera } = useThree()
  const angle = useRef(Math.PI / 5)

  useFrame((_, delta) => {
    angle.current += delta * 0.07
    camera.position.set(
      Math.sin(angle.current) * RADIUS,
      HEIGHT,
      Math.cos(angle.current) * RADIUS
    )
    camera.lookAt(0, -0.6, 0)
  })

  return null
}
