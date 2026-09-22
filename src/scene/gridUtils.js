import { GRID_SIZE, TILE_SIZE } from '../store/villageStore'

const HALF_EXTENT = ((GRID_SIZE - 1) * TILE_SIZE) / 2

export function tileCenter(col, row) {
  return [col * TILE_SIZE - HALF_EXTENT, row * TILE_SIZE - HALF_EXTENT]
}

export function worldToTile(x, z) {
  const col = Math.round((x + HALF_EXTENT) / TILE_SIZE)
  const row = Math.round((z + HALF_EXTENT) / TILE_SIZE)
  return { col, row }
}

export const GROUND_EXTENT = GRID_SIZE * TILE_SIZE

// Organic island outline: radius as a function of angle. Three overlapping
// waves give a gently lobed coastline (no two sides alike) while staying
// comfortably wider than the buildable area everywhere.
export function islandRadius(theta) {
  return (
    10.9 +
    Math.sin(theta * 3 + 0.6) * 0.55 +
    Math.sin(theta * 5 + 2.1) * 0.3 +
    Math.sin(theta * 2 + 4.0) * 0.4
  )
}

// Small deterministic PRNG so scenery lands in the same places every load.
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
