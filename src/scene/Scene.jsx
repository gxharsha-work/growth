import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useVillageStore } from '../store/villageStore'
import GradientSky, { WEATHER_TRANSITION_RATE } from './GradientSky'
import Ground from './Ground'
import Building from './Building'
import FloatingGhost from './FloatingGhost'
import Decor from './Decor'
import CameraRig from './CameraRig'
import MiniCameraRig from './MiniCameraRig'
import WeatherEffect from './WeatherEffect'
import Clouds from './Clouds'
import SelectionTracker from './SelectionTracker'

const LIGHT_INTENSITY = { sunny: 1.4, 'partly-cloudy': 0.95, rain: 0.6 }
const AMBIENT_INTENSITY = { sunny: 0.65, 'partly-cloudy': 0.58, rain: 0.48 }

export default function Scene({
  teamId,
  weekHealth,
  interactive = true,
}) {
  const buildings = useVillageStore((s) => s.buildingsByTeam[teamId])
  const dirLightRef = useRef()
  const ambientLightRef = useRef()
  const weather = weekHealth?.weather ?? 'sunny'

  useFrame((_, delta) => {
    const rate = Math.min(1, delta * WEATHER_TRANSITION_RATE)
    const targetDir = LIGHT_INTENSITY[weather] ?? LIGHT_INTENSITY.sunny
    const targetAmbient = AMBIENT_INTENSITY[weather] ?? AMBIENT_INTENSITY.sunny
    if (dirLightRef.current) {
      dirLightRef.current.intensity +=
        (targetDir - dirLightRef.current.intensity) * rate
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity +=
        (targetAmbient - ambientLightRef.current.intensity) * rate
    }
  })

  return (
    <>
      <GradientSky weather={weather} />
      <ambientLight ref={ambientLightRef} intensity={0.65} color="#dfefff" />
      <directionalLight
        ref={dirLightRef}
        position={[8, 14, 6]}
        intensity={1.4}
        color="#fff6e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0015}
      />

      <Ground teamId={teamId} interactive={interactive} />
      <Decor />

      {Object.values(buildings ?? {}).map((b) => (
        <Building
          key={b.id}
          building={b}
          interactive={interactive}
          weekHealth={weekHealth}
        />
      ))}

      {interactive && <FloatingGhost teamId={teamId} />}
      {interactive && <SelectionTracker teamId={teamId} />}

      <Clouds weather={weather} />
      <WeatherEffect weather={weather} />

      {interactive ? <CameraRig /> : <MiniCameraRig />}
    </>
  )
}
