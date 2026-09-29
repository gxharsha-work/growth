import { create } from 'zustand'
import { WEEK_COUNT } from '../data/mockSignals'
import { useVillageStore } from './villageStore'
import { useTeamsStore } from './teamsStore'
import { useSignalsStore } from './signalsStore'

const firstTeamId = () => Object.keys(useTeamsStore.getState().teams)[0] ?? null

// Loads a team's buildings + signals the moment it's actually viewed
// (called from setTeam below, and from CompareView for each team it shows)
// — the one place "start fetching this team's data" happens, so nothing
// else needs to remember to call it.
function loadTeamData(teamId) {
  if (!teamId) return
  const capabilities = useTeamsStore.getState().teams[teamId]?.capabilities ?? []
  useVillageStore.getState().ensureBuildings(teamId, capabilities)
  useSignalsStore.getState().ensureSignals(teamId)
}

// Top-level app UI state: which team & week are being viewed, whether we're
// showing a single interactive village or the side-by-side peer comparison,
// and which teams are picked for that comparison. Deliberately separate
// from villageStore (building placement) and teamsStore (team CRUD), which
// stay team-agnostic and just take/report a teamId.
export const useAppStore = create((set) => ({
  currentTeam: firstTeamId(),
  currentWeek: 0, // 0-indexed; "Week 1" in the UI
  viewMode: 'single', // 'single' | 'compare'
  compareTeamIds: [],
  teamComposerOpen: false,

  setTeam: (teamId) => {
    // a details popup anchors to a specific building on the currently
    // viewed team, so it doesn't make sense to carry it across teams
    useVillageStore.getState().clearSelection()
    loadTeamData(teamId)
    set({ currentTeam: teamId })
  },

  setWeek: (weekIndex) =>
    set({
      currentWeek: Math.max(0, Math.min(WEEK_COUNT - 1, weekIndex)),
    }),

  setViewMode: (mode) => {
    useVillageStore.getState().clearSelection()
    set((state) => {
      if (mode !== 'compare' || state.compareTeamIds.length > 0) return { viewMode: mode }
      // Entering compare mode with nothing picked yet: default to the
      // current team plus one other, rather than silently showing nothing.
      const ids = Object.keys(useTeamsStore.getState().teams)
      const defaults = [state.currentTeam, ids.find((id) => id !== state.currentTeam)].filter(
        Boolean
      )
      defaults.forEach(loadTeamData)
      return { viewMode: mode, compareTeamIds: defaults }
    })
  },

  toggleCompareTeam: (id) =>
    set((state) => {
      if (state.compareTeamIds.includes(id)) {
        return { compareTeamIds: state.compareTeamIds.filter((t) => t !== id) }
      }
      if (state.compareTeamIds.length >= 4) return {} // 5th pick: no-op; UI explains why
      loadTeamData(id)
      return { compareTeamIds: [...state.compareTeamIds, id] }
    }),

  setCompareTeamIds: (ids) => {
    const capped = ids.slice(0, 4)
    capped.forEach(loadTeamData)
    set({ compareTeamIds: capped })
  },

  openTeamComposer: () => set({ teamComposerOpen: true }),
  closeTeamComposer: () => set({ teamComposerOpen: false }),

  // Async: awaited by TeamHUD's submitTeam so it can navigate to the new
  // team once it actually exists (locally or on the backend).
  createTeam: async ({ name, sizeBucket, functionType }) => {
    const id = await useTeamsStore.getState().createTeam({ name, sizeBucket, functionType })
    if (!id) return null
    useVillageStore.getState().ensureTeamLayout(id, useTeamsStore.getState().teams[id].capabilities)
    return id
  },

  deleteTeam: async (id) => {
    useVillageStore.getState().deleteTeamLayout(id)
    useVillageStore.getState().clearSelection()
    useVillageStore.getState().cancelPlacing()
    useVillageStore.getState().cancelDragging()
    await useTeamsStore.getState().deleteTeam(id)
    set((state) => {
      const remaining = Object.keys(useTeamsStore.getState().teams)
      const compareTeamIds = state.compareTeamIds.filter((t) => t !== id)
      if (state.currentTeam !== id) return { compareTeamIds }
      const nextTeam = remaining[0] ?? null
      loadTeamData(nextTeam)
      return { currentTeam: nextTeam, compareTeamIds }
    })
  },
}))
