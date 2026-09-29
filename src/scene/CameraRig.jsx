import { useLayoutEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useVillageStore } from '../store/villageStore'

const START_POS = new THREE.Vector3(6, 30, 40)
const END_POS = new THREE.Vector3(14, 13, 18)
const TARGET = new THREE.Vector3(0, -0.6, 0)
const INTRO_DURATION = 2.2

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

export default function CameraRig() {
  const { camera } = useThree()
  const controlsRef = useRef()
  const elapsed = useRef(0)
  const [introDone, setIntroDone] = useState(false)
  // dragging a building fights with orbit-rotate if both listen to the same
  // pointer drag, so orbiting is suspended for the duration of a drag
  const isDragging = useVillageStore((s) => Boolean(s.draggingId))

  // start the camera further out and gently glide in on first load
  useLayoutEffect(() => {
    camera.position.copy(START_POS)
    camera.lookAt(TARGET)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, delta) => {
    if (introDone) return
    elapsed.current += delta
    const t = Math.min(elapsed.current / INTRO_DURATION, 1)
    const eased = easeOutCubic(t)
    camera.position.lerpVectors(START_POS, END_POS, eased)
    camera.lookAt(TARGET)
    if (t >= 1) setIntroDone(true)
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={introDone && !isDragging}
      target={TARGET}
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={9}
      maxDistance={32}
      minPolarAngle={Math.PI / 7}
      maxPolarAngle={Math.PI / 2.04}
    />
  )
}
