import { create } from 'zustand'
import { api, probeApi } from '../lib/api'
import { getWeeklySignalsForTeam, getSignalSource } from '../data/mockSignals'

// Holds each team's raw weekly signal rows — NOT the computed health score;
// that stays in src/logic/healthScore.js, run client-side against whatever
// rows land here. Deterministic math means every viewer computes the same
// score from the same rows, so there's no need to duplicate scoring
// server-side just to keep viewers in sync.
//
// Backed by GET /api/teams/:id/signals (the backend merges hand-tuned /
// live-ingested / generated-fallback rows — see functions/api/_lib/signals.ts,
// a server-side port of this same logic). Falls back to the local
// mockSignals.js/generatedSignals.js path when no backend is reachable, so
// plain `npm run dev` keeps working standalone.
export const useSignalsStore = create((set, get) => ({
  weeklyByTeam: {}, // teamId -> array of { week, jira, github, calendar }
  sourceByTeam: {}, // teamId -> 'hand-tuned' | 'live' | 'generated'
  loadedTeams: new Set(),

  // Loads a team's signals the first time it's viewed. Safe to call
  // repeatedly; only does work once per team per session.
  ensureSignals: async (teamId) => {
    if (!teamId || get().loadedTeams.has(teamId)) return
    set((state) => ({ loadedTeams: new Set(state.loadedTeams).add(teamId) }))

    if (await probeApi()) {
      try {
        const { weeks, source } = await api.get(`/teams/${teamId}/signals`)
        set((state) => ({
          weeklyByTeam: { ...state.weeklyByTeam, [teamId]: weeks },
          sourceByTeam: { ...state.sourceByTeam, [teamId]: source },
        }))
        return
      } catch (err) {
        console.error(`Failed to load signals for ${teamId} from backend, using local data:`, err)
      }
    }

    set((state) => ({
      weeklyByTeam: { ...state.weeklyByTeam, [teamId]: getWeeklySignalsForTeam(teamId) },
      sourceByTeam: { ...state.sourceByTeam, [teamId]: getSignalSource(teamId) },
    }))
  },
}))
