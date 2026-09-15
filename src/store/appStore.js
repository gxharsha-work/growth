import { create } from 'zustand'
import { WEEK_COUNT } from '../data/mockSignals'
import { useVillageStore } from './villageStore'

// Top-level app UI state: which team & week are being viewed, and whether
// we're showing a single interactive village or the side-by-side peer
// comparison. Deliberately separate from villageStore (building placement),
// which stays team-agnostic and just takes a teamId per action.
export const useAppStore = create((set) => ({
  currentTeam: 'platform',
  currentWeek: 0, // 0-indexed; "Week 1" in the UI
  viewMode: 'single', // 'single' | 'compare'

  setTeam: (teamId) => {
    // a details popup anchors to a specific building on the currently
    // viewed team, so it doesn't make sense to carry it across teams
    useVillageStore.getState().clearSelection()
    set({ currentTeam: teamId })
  },

  setWeek: (weekIndex) =>
    set({
      currentWeek: Math.max(0, Math.min(WEEK_COUNT - 1, weekIndex)),
    }),

  setViewMode: (mode) => {
    useVillageStore.getState().clearSelection()
    set({ viewMode: mode })
  },
}))
