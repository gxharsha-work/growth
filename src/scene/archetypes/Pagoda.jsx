import { Mat, STONE, CREAM, DARK } from './shared'

const TIERS = [0.92, 0.74, 0.56]
const WALL_H = 0.38

export default function Pagoda({ ghost = false, accent }) {
  const tiers = TIERS.map((w, i) => ({ w, y0: 0.16 + i * 0.56 }))
  const topY = 0.16 + TIERS.length * 0.56 + 0.12

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[1.5, 0.1, 1.5]} />
        <Mat color={STONE} ghost={ghost} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.13, 0]}>
        <boxGeometry args={[1.2, 0.07, 1.2]} />
        <Mat color="#dcd6c8" ghost={ghost} />
      </mesh>
      {tiers.map(({ w, y0: base }, i) => {
        const roofRadius = (w / 2 + 0.2) / Math.SQRT1_2
        return (
          <group key={i}>
            <mesh castShadow position={[0, base + WALL_H / 2, 0]}>
              <boxGeometry args={[w, WALL_H, w]} />
              <Mat color={CREAM} ghost={ghost} />
            </mesh>
            <mesh position={[0, base + WALL_H / 2, w / 2 + 0.005]}>
              <boxGeometry args={[w * 0.32, WALL_H * 0.55, 0.03]} />
              <Mat color={i === 0 ? DARK : '#ffd98a'} glow={i === 0 ? 0 : 0.5} noTint={i !== 0} ghost={ghost} />
            </mesh>
            <mesh castShadow position={[0, base + WALL_H + 0.14, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[roofRadius, 0.3, 4]} />
              <Mat color={accent} ghost={ghost} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[0, topY + 0.2, 0]}>
        <cylinderGeometry args={[0.022, 0.03, 0.55, 6]} />
        <Mat color="#e6b84a" ghost={ghost} />
      </mesh>
      {[0.05, 0.16, 0.27].map((dy, i) => (
        <mesh key={i} position={[0, topY + dy, 0]}>
          <torusGeometry args={[0.07 - i * 0.012, 0.014, 5, 12]} />
          <Mat color="#e6b84a" ghost={ghost} />
        </mesh>
      ))}
      {[
        [-0.62, 0.62],
        [0.62, 0.62],
        [-0.62, -0.62],
        [0.62, -0.62],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, tiers[0].y0 + 0.36, z]}>
          <sphereGeometry args={[0.055, 8, 8]} />
          <Mat color="#ffcf6b" glow={1} noTint ghost={ghost} />
        </mesh>
      ))}
    </group>
  )
}
