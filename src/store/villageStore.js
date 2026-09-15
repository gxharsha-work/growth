import { create } from 'zustand'
import { TEAM_IDS } from '../data/roster'

export const GRID_SIZE = 8
export const TILE_SIZE = 2

// The four skill-coverage variants share one base "capability building" shape
// (see models/CapabilityBuilding.jsx) and are the only types whose look is
// driven by that week's Jira/GitHub signals — `category: 'capability'` is
// what both the sidebar grouping and the health-score visuals key off.
export const BUILDING_TYPES = {
  'capability-frontend': {
    id: 'capability-frontend',
    label: 'Frontend Skills',
    blurb: 'Frontend skill coverage',
    color: '#4f8fd1',
    category: 'capability',
  },
  'capability-backend': {
    id: 'capability-backend',
    label: 'Backend Skills',
    blurb: 'Backend skill coverage',
    color: '#d9694a',
    category: 'capability',
  },
  'capability-qa': {
    id: 'capability-qa',
    label: 'QA Coverage',
    blurb: 'QA & test coverage',
    color: '#8a63c9',
    category: 'capability',
  },
  'capability-devops': {
    id: 'capability-devops',
    label: 'DevOps/Infra',
    blurb: 'DevOps & infra coverage',
    color: '#3fa79a',
    category: 'capability',
  },
  knowledge: {
    id: 'knowledge',
    label: 'Knowledge Garden',
    blurb: 'Shared knowledge',
    color: '#6fb35c',
    category: 'village',
  },
  landmark: {
    id: 'landmark',
    label: 'Landmark',
    blurb: 'Just for charm',
    color: '#d9b36c',
    category: 'village',
  },
  road: {
    id: 'road',
    label: 'Collaboration Road',
    blurb: 'Team dependency path',
    color: '#a68a6a',
    category: 'village',
  },
}

const tileKey = (col, row) => `${col},${row}`

let nextId = 1
const makeId = () => `b${nextId++}`

// Both teams start from the same small layout so there's always something
// for the health score to visibly animate, and so the two teams line up
// tile-for-tile in the peer comparison view. `name`/`notes` are the
// user-editable fields from the details popup — blank until someone edits.
function starterEntry(type, col, row) {
  return {
    id: makeId(),
    type,
    col,
    row,
    justPlaced: false,
    name: '',
    notes: '',
  }
}

function defaultLayout() {
  return {
    [tileKey(3, 3)]: starterEntry('capability-backend', 3, 3),
    [tileKey(4, 3)]: starterEntry('knowledge', 4, 3),
    [tileKey(3, 4)]: starterEntry('landmark', 3, 4),
    [tileKey(4, 4)]: starterEntry('road', 4, 4),
  }
}

function defaultBuildingsByTeam() {
  return Object.fromEntries(TEAM_IDS.map((id) => [id, defaultLayout()]))
}

export const useVillageStore = create((set, get) => ({
  // teamId -> tileKey -> { id, type, col, row, justPlaced }
  buildingsByTeam: defaultBuildingsByTeam(),

  // building type id currently being placed from the panel, or null
  placingType: null,

  // { col, row } | null — tile currently under the pointer
  hoveredTile: null,

  // id of a placed building currently being dragged, or null
  draggingId: null,

  // tileKey that should flash red because a placement/drop was blocked
  blockedTile: null,

  // id of the building whose details popup is open, or null
  selectedId: null,

  // { x, y } CSS-pixel anchor for the details popup, kept in sync with the
  // selected building's on-screen position each frame — null when nothing
  // is selected or it hasn't been projected yet
  selectedScreenPos: null,

  buildingsFor: (teamId) => get().buildingsByTeam[teamId] ?? {},

  isTileOccupied: (teamId, col, row, ignoreId = null) => {
    const b = get().buildingsByTeam[teamId]?.[tileKey(col, row)]
    if (!b) return false
    if (ignoreId && b.id === ignoreId) return false
    return true
  },

  inBounds: (col, row) =>
    col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE,

  startPlacing: (typeId) =>
    set({
      placingType: typeId,
      draggingId: null,
      hoveredTile: null,
      selectedId: null,
      selectedScreenPos: null,
    }),

  cancelPlacing: () => set({ placingType: null, hoveredTile: null }),

  setHoveredTile: (tile) => set({ hoveredTile: tile }),

  selectBuilding: (id) =>
    set({ selectedId: id, draggingId: null, placingType: null }),

  clearSelection: () => set({ selectedId: null, selectedScreenPos: null }),

  setSelectedScreenPos: (pos) => set({ selectedScreenPos: pos }),

  updateBuildingDetails: (teamId, id, { name, notes }) =>
    set((state) => {
      const teamBuildings = state.buildingsByTeam[teamId]
      const key = Object.keys(teamBuildings ?? {}).find(
        (k) => teamBuildings[k].id === id
      )
      if (!key) return {}
      return {
        buildingsByTeam: {
          ...state.buildingsByTeam,
          [teamId]: {
            ...teamBuildings,
            [key]: { ...teamBuildings[key], name, notes },
          },
        },
      }
    }),

  flashBlocked: (col, row) => {
    const key = tileKey(col, row)
    set({ blockedTile: key })
    setTimeout(() => {
      if (get().blockedTile === key) set({ blockedTile: null })
    }, 350)
  },

  placeBuilding: (teamId, col, row) => {
    const { placingType, isTileOccupied, inBounds, flashBlocked } = get()
    if (!placingType) return
    if (!inBounds(col, row) || isTileOccupied(teamId, col, row)) {
      flashBlocked(col, row)
      return
    }
    const id = makeId()
    set((state) => ({
      buildingsByTeam: {
        ...state.buildingsByTeam,
        [teamId]: {
          ...state.buildingsByTeam[teamId],
          [tileKey(col, row)]: {
            id,
            type: placingType,
            col,
            row,
            justPlaced: true,
            name: '',
            notes: '',
          },
        },
      },
      placingType: null,
      hoveredTile: null,
    }))
    // clear the "just placed" flag after the pop-in animation plays once
    setTimeout(() => {
      set((state) => {
        const teamBuildings = state.buildingsByTeam[teamId]
        const entry = teamBuildings?.[tileKey(col, row)]
        if (!entry || entry.id !== id) return {}
        return {
          buildingsByTeam: {
            ...state.buildingsByTeam,
            [teamId]: {
              ...teamBuildings,
              [tileKey(col, row)]: { ...entry, justPlaced: false },
            },
          },
        }
      })
    }, 700)
  },

  startDragging: (id) =>
    set({
      draggingId: id,
      placingType: null,
      selectedId: null,
      selectedScreenPos: null,
    }),

  cancelDragging: () => set({ draggingId: null, hoveredTile: null }),

  dropBuilding: (teamId, col, row) => {
    const { draggingId, buildingsByTeam, isTileOccupied, inBounds, flashBlocked } =
      get()
    if (!draggingId) return
    const teamBuildings = buildingsByTeam[teamId] ?? {}
    const entry = Object.values(teamBuildings).find(
      (b) => b.id === draggingId
    )
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

export { tileKey }
