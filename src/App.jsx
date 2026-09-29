import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Scene from './scene/Scene'
import Panel from './ui/Panel'
import TeamHUD from './ui/TeamHUD'
import Timeline from './ui/Timeline'
import CompareView from './ui/CompareView'
import BuildingDetailsPopup from './ui/BuildingDetailsPopup'
import EmptyVillageState from './ui/EmptyVillageState'
import { useVillageStore } from './store/villageStore'
import { useAppStore } from './store/appStore'
import { useTeamsStore } from './store/teamsStore'
import { useSignalsStore } from './store/signalsStore'
import { getTeamWeek } from './logic/teamHealth'
import './App.css'

export default function App() {
  const cancelPlacing = useVillageStore((s) => s.cancelPlacing)
  const cancelDragging = useVillageStore((s) => s.cancelDragging)
  const clearSelection = useVillageStore((s) => s.clearSelection)
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)
  const viewMode = useAppStore((s) => s.viewMode)
  const setTeam = useAppStore((s) => s.setTeam)
  const openTeamComposer = useAppStore((s) => s.openTeamComposer)

  const hasTeam = currentTeam != null
  // Subscribed purely so this re-renders once buildings/signals finish
  // loading async (they're read imperatively below, not reactively).
  useVillageStore((s) => s.buildingsByTeam[currentTeam])
  useSignalsStore((s) => s.weeklyByTeam[currentTeam])
  const weekHealth = hasTeam ? getTeamWeek(currentTeam, currentWeek) : null

  // One-time startup: load the real team list from the backend if one is
  // reachable (see teamsStore.hydrate). If the currently-selected team
  // isn't in whatever list comes back (fresh backend, or a locally-seeded
  // id the server doesn't have), fall back to the first real team instead
  // of showing a dead village. Otherwise just kick off that team's
  // buildings/signals load.
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      await useTeamsStore.getState().hydrate()
      if (cancelled) return
      const ids = Object.keys(useTeamsStore.getState().teams)
      const current = useAppStore.getState().currentTeam
      setTeam(ids.includes(current) ? current : (ids[0] ?? null))
    }
    bootstrap()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      ) : hasTeam ? (
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
      ) : (
        <EmptyVillageState onCreate={openTeamComposer} />
      )}
      <TeamHUD />
      <Timeline />
    </div>
  )
}
