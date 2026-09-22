import { Mat, WOOD, WOOD_DARK } from './shared'

const WEDGES = 8
const PRODUCE = ['#ef5350', '#ffb74d', '#9ccc65', '#ef5350', '#ffd54f']

export default function Bazaar({ ghost = false, accent }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.98, 1.02, 0.1, 12]} />
        <Mat color="#cfa873" ghost={ghost} />
      </mesh>
      {[
        [-0.6, 0.6],
        [0.6, 0.6],
        [-0.6, -0.6],
        [0.6, -0.6],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.6, z]}>
          <cylinderGeometry args={[0.04, 0.045, 1.0, 6]} />
          <Mat color={WOOD} ghost={ghost} />
        </mesh>
      ))}
      {/* striped tent roof: alternating wedges */}
      {Array.from({ length: WEDGES }, (_, k) => (
        <mesh key={k} castShadow position={[0, 1.33, 0]} rotation={[0, Math.PI / WEDGES, 0]}>
          <cylinderGeometry args={[0.02, 1.0, 0.46, 1, 1, false, (k * Math.PI * 2) / WEDGES, (Math.PI * 2) / WEDGES]} />
          <Mat color={k % 2 ? '#fff8ea' : accent} side={2} ghost={ghost} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <Mat color="#ffd166" ghost={ghost} />
      </mesh>
      {/* counter, goods and a sign */}
      <mesh castShadow position={[0, 0.31, -0.12]}>
        <boxGeometry args={[0.95, 0.42, 0.42]} />
        <Mat color={WOOD} ghost={ghost} />
      </mesh>
      <mesh position={[0, 0.54, -0.12]}>
        <boxGeometry args={[1.02, 0.05, 0.48]} />
        <Mat color="#b98252" ghost={ghost} />
      </mesh>
      {PRODUCE.map((color, i) => (
        <mesh key={i} castShadow position={[-0.36 + i * 0.18, 0.64, -0.12 + (i % 2) * 0.07]}>
          <sphereGeometry args={[0.07, 8, 8]} />
          <Mat color={color} ghost={ghost} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, 0.62]}>
        <boxGeometry args={[0.56, 0.16, 0.03]} />
        <Mat color={accent} ghost={ghost} />
      </mesh>
      {[-0.28, 0.28].map((x) => (
        <mesh key={x} position={[x, 0.78, 0.62]}>
          <boxGeometry args={[0.03, 0.2, 0.03]} />
          <Mat color={WOOD_DARK} ghost={ghost} />
        </mesh>
      ))}
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, 1.02, 0.28]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <Mat color="#ffcf6b" glow={1} noTint ghost={ghost} />
        </mesh>
      ))}
    </group>
  )
}
