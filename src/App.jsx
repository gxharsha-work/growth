import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Scene from './scene/Scene'
import Panel from './ui/Panel'
import TeamHUD from './ui/TeamHUD'
import Timeline from './ui/Timeline'
import CompareView from './ui/CompareView'
import BuildingDetailsPopup from './ui/BuildingDetailsPopup'
import { useVillageStore } from './store/villageStore'
import { useAppStore } from './store/appStore'
import { getTeamWeek } from './logic/teamHealth'
import './App.css'

export default function App() {
  const cancelPlacing = useVillageStore((s) => s.cancelPlacing)
  const cancelDragging = useVillageStore((s) => s.cancelDragging)
  const clearSelection = useVillageStore((s) => s.clearSelection)
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)
  const viewMode = useAppStore((s) => s.viewMode)

  const weekHealth = getTeamWeek(currentTeam, currentWeek)

  // Esc backs out of placing mode
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        cancelPlacing()
        cancelDragging()
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cancelPlacing, cancelDragging, clearSelection])

  // safety net: if the pointer is released outside the grass plane
  // (e.g. over the side panel) while dragging, don't leave a building stuck
  useEffect(() => {
    const onPointerUp = () => {
      if (useVillageStore.getState().draggingId) {
        cancelDragging()
      }
    }
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [cancelDragging])

  const isCompare = viewMode === 'compare'

  return (
    <div className="app-root">
      {isCompare ? (
        <CompareView />
      ) : (
        <>
          <Canvas
            className="app-canvas"
            shadows="soft"
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
            camera={{ fov: 42, near: 0.1, far: 500 }}
          >
            <Scene teamId={currentTeam} weekHealth={weekHealth} interactive />
          </Canvas>
          <Panel />
          <BuildingDetailsPopup />
        </>
      )}
      <TeamHUD />
      <Timeline />
    </div>
  )
}
