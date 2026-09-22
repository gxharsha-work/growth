import { create } from 'zustand'
import { TEAM_IDS, TEAMS } from '../data/roster'
import { guessArchetype } from '../data/archetypes'

export const GRID_SIZE = 8
export const TILE_SIZE = 2

// The island is organic, but placement still snaps to an invisible grid so
// buildings never overlap. Tiles whose centers fall too far from the middle
// are cliff/rim (scenery only), which gives the buildable area a rounded
// silhouette instead of a square.
const HALF_EXTENT = ((GRID_SIZE - 1) * TILE_SIZE) / 2
const LAND_TILE_RADIUS = 8.1

// The central 2x2 tiles belong to the Knowledge Commons — the one shared
// space every team has. It isn't placeable, so it never has to be managed.
export const COMMONS_ID = 'commons'
const COMMONS_TILES = new Set(['3,3', '4,3', '3,4', '4,4'])

export const tileKey = (col, row) => `${col},${row}`

function centerOf(col, row) {
  return [col * TILE_SIZE - HALF_EXTENT, row * TILE_SIZE - HALF_EXTENT]
}

export function isLandTile(col, row) {
  if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return false
  const [x, z] = centerOf(col, row)
  return Math.hypot(x, z) <= LAND_TILE_RADIUS
}

export function isCommonsTile(col, row) {
  return COMMONS_TILES.has(tileKey(col, row))
}

export function isBuildableTile(col, row) {
  return isLandTile(col, row) && !isCommonsTile(col, row)
}

export function listBuildableTiles() {
  const tiles = []
  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE; row++) {
      if (isBuildableTile(col, row)) tiles.push({ col, row })
    }
  }
  return tiles
}

// Picks the free tile that sits on a comfortable ring around the Commons
// while staying as far from existing buildings as possible, so "add for me"
// always produces a well-spaced village. Deterministic.
export function pickAutoTile(teamBuildings) {
  const placed = Object.values(teamBuildings ?? {}).map((b) => centerOf(b.col, b.row))
  let best = null
  let bestScore = -Infinity
  for (const { col, row } of listBuildableTiles()) {
    if (teamBuildings?.[tileKey(col, row)]) continue
    const [x, z] = centerOf(col, row)
    let nearest = 6
    for (const [px, pz] of placed) nearest = Math.min(nearest, Math.hypot(x - px, z - pz))
    // a slight bias toward the camera-facing side so early buildings are visible
    const score = -Math.abs(Math.hypot(x, z) - 5.4) + nearest * 0.9 + (x + z) * 0.02
    if (score > bestScore) {
      bestScore = score
      best = { col, row }
    }
  }
  return best
}

export function countArchetypes(teamBuildings) {
  const counts = {}
  for (const b of Object.values(teamBuildings ?? {})) {
    counts[b.archetype] = (counts[b.archetype] ?? 0) + 1
  }
  return counts
}

let nextId = 1
const makeId = () => `b${nextId++}`

function makeEntry({ name, archetype, col, row, justPlaced = false }) {
  return { id: makeId(), name, archetype, col, row, justPlaced, notes: '' }
}

// Every team starts with its suggested capabilities already on the island,
// so nobody stares at an empty world on first load.
function defaultLayout(teamId) {
  const layout = {}
  for (const name of TEAMS[teamId]?.capabilities ?? []) {
    const spot = pickAutoTile(layout)
    if (!spot) break
    const archetype = guessArchetype(name, countArchetypes(layout))
    layout[tileKey(spot.col, spot.row)] = makeEntry({ name, archetype, ...spot })
  }
  return layout
}

function defaultBuildingsByTeam() {
  return Object.fromEntries(TEAM_IDS.map((id) => [id, defaultLayout(id)]))
}

export const useVillageStore = create((set, get) => ({
  // teamId -> tileKey -> { id, name, archetype, notes, col, row, justPlaced }
  buildingsByTeam: defaultBuildingsByTeam(),

  // { name, archetype } being placed from the panel, or null
  placing: null,

  // { col, row } | null — tile currently under the pointer
  hoveredTile: null,

  // id of a placed building currently being dragged, or null
  draggingId: null,

  // tileKey that should flash red because a placement/drop was blocked
  blockedTile: null,

  // id of the building (or COMMONS_ID) whose details popup is open, or null
  selectedId: null,

  // { x, y } CSS-pixel anchor for the details popup, kept in sync with the
  // selected item's on-screen position each frame
  selectedScreenPos: null,

  // id currently hovered in the side panel, so the scene can spotlight it
  highlightedId: null,

  buildingsFor: (teamId) => get().buildingsByTeam[teamId] ?? {},

  isTileOccupied: (teamId, col, row, ignoreId = null) => {
    if (isCommonsTile(col, row)) return true
    const b = get().buildingsByTeam[teamId]?.[tileKey(col, row)]
    if (!b) return false
    if (ignoreId && b.id === ignoreId) return false
    return true
  },

  inBounds: (col, row) => isLandTile(col, row),

  startPlacing: (draft) =>
    set({
      placing: draft,
      draggingId: null,
      hoveredTile: null,
      selectedId: null,
      selectedScreenPos: null,
    }),

  cancelPlacing: () => set({ placing: null, hoveredTile: null }),

  setHoveredTile: (tile) => set({ hoveredTile: tile }),

  setHighlightedId: (id) => set({ highlightedId: id }),

  selectBuilding: (id) => set({ selectedId: id, draggingId: null, placing: null }),

  clearSelection: () => set({ selectedId: null, selectedScreenPos: null }),

  setSelectedScreenPos: (pos) => set({ selectedScreenPos: pos }),

  updateBuildingDetails: (teamId, id, { name, notes, archetype }) =>
    set((state) => {
      const teamBuildings = state.buildingsByTeam[teamId]
      const key = Object.keys(teamBuildings ?? {}).find((k) => teamBuildings[k].id === id)
      if (!key) return {}
      const current = teamBuildings[key]
      return {
        buildingsByTeam: {
          ...state.buildingsByTeam,
          [teamId]: {
            ...teamBuildings,
            [key]: {
              ...current,
              name: name ?? current.name,
              notes: notes ?? current.notes,
              archetype: archetype ?? current.archetype,
            },
          },
        },
      }
    }),

  removeBuilding: (teamId, id) =>
    set((state) => {
      const teamBuildings = state.buildingsByTeam[teamId]
      const key = Object.keys(teamBuildings ?? {}).find((k) => teamBuildings[k].id === id)
      if (!key) return {}
      const next = { ...teamBuildings }
      delete next[key]
      return {
        buildingsByTeam: { ...state.buildingsByTeam, [teamId]: next },
        selectedId: state.selectedId === id ? null : state.selectedId,
        selectedScreenPos: state.selectedId === id ? null : state.selectedScreenPos,
        highlightedId: state.highlightedId === id ? null : state.highlightedId,
      }
    }),

  flashBlocked: (col, row) => {
    const key = tileKey(col, row)
    set({ blockedTile: key })
    setTimeout(() => {
      if (get().blockedTile === key) set({ blockedTile: null })
    }, 350)
  },

  // Adds a capability on the tile the user clicked (placing mode).
  placeBuilding: (teamId, col, row) => {
    const { placing, isTileOccupied, inBounds, flashBlocked } = get()
    if (!placing) return
    if (!inBounds(col, row) || isTileOccupied(teamId, col, row)) {
      flashBlocked(col, row)
      return
    }
    const entry = makeEntry({ ...placing, col, row, justPlaced: true })
    set((state) => ({
      buildingsByTeam: {
        ...state.buildingsByTeam,
        [teamId]: { ...state.buildingsByTeam[teamId], [tileKey(col, row)]: entry },
      },
      placing: null,
      hoveredTile: null,
    }))
    get().settleJustPlaced(teamId, entry.id, col, row)
  },

  // Adds a capability on the best free tile — the zero-friction path used by
  // suggestion chips. Returns the new id, or null when the island is full.
  addCapability: (teamId, { name, archetype }) => {
    const teamBuildings = get().buildingsByTeam[teamId] ?? {}
    const spot = pickAutoTile(teamBuildings)
    if (!spot) return null
    const chosen = archetype ?? guessArchetype(name, countArchetypes(teamBuildings))
    const entry = makeEntry({ name, archetype: chosen, ...spot, justPlaced: true })
    set((state) => ({
      buildingsByTeam: {
        ...state.buildingsByTeam,
        [teamId]: { ...state.buildingsByTeam[teamId], [tileKey(spot.col, spot.row)]: entry },
      },
    }))
    get().settleJustPlaced(teamId, entry.id, spot.col, spot.row)
    return entry.id
  },

  // clears the "just placed" flag once the pop-in animation has played
  settleJustPlaced: (teamId, id, col, row) => {
    setTimeout(() => {
      set((state) => {
        const teamBuildings = state.buildingsByTeam[teamId]
        const entry = teamBuildings?.[tileKey(col, row)]
        if (!entry || entry.id !== id) return {}
        return {
          buildingsByTeam: {
            ...state.buildingsByTeam,
            [teamId]: { ...teamBuildings, [tileKey(col, row)]: { ...entry, justPlaced: false } },
          },
        }
      })
    }, 700)
  },

  startDragging: (id) =>
    set({ draggingId: id, placing: null, selectedId: null, selectedScreenPos: null }),

  cancelDragging: () => set({ draggingId: null, hoveredTile: null }),

  dropBuilding: (teamId, col, row) => {
    const { draggingId, buildingsByTeam, isTileOccupied, inBounds, flashBlocked } = get()
    if (!draggingId) return
    const teamBuildings = buildingsByTeam[teamId] ?? {}
    const entry = Object.values(teamBuildings).find((b) => b.id === draggingId)
    if (!entry) {
      set({ draggingId: null, hoveredTile: null })
      return
    }
    if (!inBounds(col, row) || isTileOccupied(teamId, col, row, draggingId)) {
      flashBlocked(col, row)
      set({ draggingId: null, hoveredTile: null })
      return
    }
    set((state) => {
      const next = { ...state.buildingsByTeam[teamId] }
      delete next[tileKey(entry.col, entry.row)]
      next[tileKey(col, row)] = { ...entry, col, row }
      return {
        buildingsByTeam: { ...state.buildingsByTeam, [teamId]: next },
        draggingId: null,
        hoveredTile: null,
      }
    })
  },
}))
