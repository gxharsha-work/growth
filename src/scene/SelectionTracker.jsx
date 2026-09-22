import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { COMMONS_ID, useVillageStore } from '../store/villageStore'
import { tileCenter } from './gridUtils'

// Projects the selected building's 3D position into CSS pixel coordinates
// each frame, so the (plain HTML) details popup can anchor itself near the
// building on screen even as the camera orbits. Only does any work while
// something is actually selected.
export default function SelectionTracker({ teamId }) {
  const { camera, size } = useThree()
  const vector = useRef(new THREE.Vector3())
  const lastSent = useRef({ x: -1, y: -1 })
  const lastSelectedId = useRef(null)

  useFrame(() => {
    const state = useVillageStore.getState()
    const { selectedId } = state
    if (!selectedId) {
      lastSelectedId.current = null
      return
    }
    // a fresh selection must always push at least one update, even if it
    // lands on the exact same screen position as whatever was selected
    // before (e.g. reselecting the same building after closing the popup)
    if (selectedId !== lastSelectedId.current) {
      lastSelectedId.current = selectedId
      lastSent.current = { x: -1, y: -1 }
    }

    let x = 0
    let z = 0
    let y = 2.6
    if (selectedId !== COMMONS_ID) {
      const building = Object.values(state.buildingsByTeam[teamId] ?? {}).find(
        (b) => b.id === selectedId
      )
      if (!building) return
      ;[x, z] = tileCenter(building.col, building.row)
      y = 2.9
    }
    vector.current.set(x, y, z)
    vector.current.project(camera)

    const screenX = ((vector.current.x + 1) / 2) * size.width
    const screenY = ((1 - vector.current.y) / 2) * size.height

    // avoid spamming the store with sub-pixel jitter every frame
    if (
      Math.abs(screenX - lastSent.current.x) > 0.5 ||
      Math.abs(screenY - lastSent.current.y) > 0.5
    ) {
      lastSent.current = { x: screenX, y: screenY }
      state.setSelectedScreenPos({ x: screenX, y: screenY })
    }
  })

  return null
}
