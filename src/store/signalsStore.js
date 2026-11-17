import { create } from 'zustand'
import { api, probeApi } from '../lib/api'
import { getWeeklySignalsForTeam, getSignalSource } from '../data/mockSignals'
import { invalidateTeamHealth } from '../logic/teamHealthCache'

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
  consentByTeam: {}, // teamId -> { total, consented, minConsented, scoreAllowed } (FR18)
  errorByTeam: {},
  githubSyncByTeam: {}, // teamId -> { status: 'ok' | 'error', lastRun } from the latest ingestion run // teamId -> true when the backend was reachable but this team's data failed to load
  loadedTeams: new Set(),

  // Loads a team's signals the first time it's viewed. Safe to call
  // repeatedly; only does work once per team per session.
  ensureSignals: async (teamId) => {
    if (!teamId || get().loadedTeams.has(teamId)) return
    set((state) => ({ loadedTeams: new Set(state.loadedTeams).add(teamId) }))

    if (await probeApi()) {
      try {
        const { weeks, source, consent, githubSync } = await api.get(`/teams/${teamId}/signals`)
        set((state) => ({
          githubSyncByTeam: { ...state.githubSyncByTeam, [teamId]: githubSync ?? null },
          errorByTeam: { ...state.errorByTeam, [teamId]: false },
          weeklyByTeam: { ...state.weeklyByTeam, [teamId]: weeks },
          sourceByTeam: { ...state.sourceByTeam, [teamId]: source },
          consentByTeam: { ...state.consentByTeam, [teamId]: consent ?? null },
        }))
        return
      } catch (err) {
        // The backend is up but this request failed: say so, never show bundled sample data instead.
        console.error(`Failed to load signals for ${teamId}:`, err)
        set((state) => ({ errorByTeam: { ...state.errorByTeam, [teamId]: true } }))
        return
      }
    }

    set((state) => ({
      weeklyByTeam: { ...state.weeklyByTeam, [teamId]: getWeeklySignalsForTeam(teamId) },
      sourceByTeam: { ...state.sourceByTeam, [teamId]: getSignalSource(teamId) },
    }))
  },

  // Re-reads a team's signals after its consent changes (the server decides
  // whether they are withheld), dropping the cached health rows first.
  reloadSignals: async (teamId) => {
    invalidateTeamHealth(teamId)
    set((state) => {
      const loadedTeams = new Set(state.loadedTeams)
      loadedTeams.delete(teamId)
      return { loadedTeams }
    })
    await get().ensureSignals(teamId)
  },
}))
