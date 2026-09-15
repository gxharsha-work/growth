import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { TEAM_IDS, TEAMS } from '../data/roster'
import { useAppStore } from '../store/appStore'
import { getTeamWeek } from '../logic/teamHealth'
import Scene from '../scene/Scene'
import './compareView.css'

// FR8, lightweight: both teams' villages rendered side by side at the same
// week, each labeled with its current score, so a viewer can compare
// "healthy" vs. "struggling" in one glance. Read-only — no placement/drag.
export default function CompareView() {
  const currentWeek = useAppStore((s) => s.currentWeek)

  return (
    <div className="compare-view">
      {TEAM_IDS.map((teamId) => {
        const weekHealth = getTeamWeek(teamId, currentWeek)
        return (
          <div className="compare-card" key={teamId}>
            <div className="compare-card-header">
              <span className="compare-team-name">{TEAMS[teamId].name}</span>
              <span className="compare-score">{weekHealth?.score ?? '–'}</span>
            </div>
            <div
              className={`compare-warning-wrap${
                weekHealth?.earlyWarning ? ' compare-warning-wrap--visible' : ''
              }`}
            >
              <div className="compare-warning">
                ⚠️ Early warning: rising cycle time and workload
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
