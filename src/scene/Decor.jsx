import DecorTree from './models/DecorTree'
import DecorBush from './models/DecorBush'
import Banner from './models/Banner'

// Hand-placed decoration scattered just outside the buildable grid so the
// village doesn't feel empty before anything has been placed yet.
const TREES = [
  { position: [-9.2, 0, -5.5], scale: 1.1, swaySeed: 0.3 },
  { position: [9.6, 0, 3.2], scale: 0.9, swaySeed: 1.8 },
  { position: [-8.8, 0, 7.6], scale: 1.0, swaySeed: 3.1 },
]

const BUSHES = [
  { position: [8.4, 0, -8.6] },
  { position: [-9.4, 0, 1.4] },
]

const BANNERS = [{ position: [8.6, 0, 8.2], swaySeed: 0.6 }]

export default function Decor() {
  return (
    <group>
      {TREES.map((t, i) => (
        <DecorTree key={`tree-${i}`} {...t} />
      ))}
      {BUSHES.map((b, i) => (
        <DecorBush key={`bush-${i}`} {...b} />
      ))}
      {BANNERS.map((b, i) => (
        <Banner key={`banner-${i}`} {...b} />
      ))}
    </group>
  )
}
