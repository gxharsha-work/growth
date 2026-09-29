import { Canvas } from '@react-three/fiber'
import { TriangleAlert } from 'lucide-react'
import * as THREE from 'three'
import { useAppStore } from '../store/appStore'
import { useTeamsStore } from '../store/teamsStore'
import { useVillageStore } from '../store/villageStore'
import { useSignalsStore } from '../store/signalsStore'
import { getTeamWeek } from '../logic/teamHealth'
import Scene from '../scene/Scene'
import './compareView.css'

// Lightweight team comparison: the teams picked in appStore.compareTeamIds
// (2-4 of them) rendered side by side at the same week, each labeled with
// its current score. Read-only — no placement/drag.
export default function CompareView() {
  const currentWeek = useAppStore((s) => s.currentWeek)
  const compareTeamIds = useAppStore((s) => s.compareTeamIds)
  const teams = useTeamsStore((s) => s.teams)
  // Subscribed purely so this re-renders once buildings/signals finish
  // loading async for whichever teams are picked (setViewMode/
  // toggleCompareTeam/setCompareTeamIds already kick off the loads).
  useVillageStore((s) => s.buildingsByTeam)
  useSignalsStore((s) => s.weeklyByTeam)

  return (
    <div className="compare-view">
      {compareTeamIds.map((teamId) => {
        const team = teams[teamId]
        if (!team) return null // defensive: appStore.deleteTeam already prunes this
        const weekHealth = getTeamWeek(teamId, currentWeek)
        return (
          <div className="compare-card glass" key={teamId}>
            <div className="compare-card-header">
              <span className="compare-team-name">{team.name}</span>
              <span className="compare-score">{weekHealth?.score ?? '–'}</span>
            </div>
            <div
              className={`compare-warning-wrap${
                weekHealth?.earlyWarning ? ' compare-warning-wrap--visible' : ''
              }`}
            >
              <div className="compare-warning">
                <TriangleAlert size={14} />
                Early warning: rising cycle time and workload
              </div>
            </div>
            <div className="compare-canvas-wrap">
              <Canvas
                shadows="soft"
                dpr={[1, 1.5]}
                gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
                camera={{ fov: 42, near: 0.1, far: 500 }}
              >
                <Scene
                  teamId={teamId}
                  weekHealth={weekHealth}
                  interactive={false}
                />
              </Canvas>
            </div>
          </div>
        )
      })}
    </div>
  )
}
