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
