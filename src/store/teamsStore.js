import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Owns the team list itself (id, name, cohort, suggested capabilities).
// Persisted to localStorage so teams created/renamed/deleted at runtime
// survive a reload. Village layouts (villageStore) and signal history
// (mockSignals.js) are keyed off a team's id, which this store never
// regenerates once assigned — only `createTeam` mints one, via slugify.

function slugify(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'team'
  )
}

// createdAt: 0 marks the three seed teams (predates real creation tracking).
const SEED_TEAMS = {
  platform: {
    id: 'platform',
    name: 'Platform Team',
    cohort: { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' },
    capabilities: ['Frontend', 'Backend', 'QA', 'DevOps'],
    createdAt: 0,
  },
  backend: {
    id: 'backend',
    name: 'Backend Team',
    cohort: { sizeBucket: '6-10 engineers', functionType: 'Backend/Platform' },
    capabilities: ['APIs', 'Data Pipelines', 'Reliability', 'Security'],
    createdAt: 0,
  },
  solstice: {
    id: 'solstice',
    name: 'Growth (Solstice Outdoors)',
    cohort: { sizeBucket: '1-5 engineers', functionType: 'Growth Marketing' },
    capabilities: ['Paid Media', 'SEO & Content', 'Lifecycle & CRM', 'Analytics', 'Partnerships'],
    createdAt: 0,
  },
}

export const useTeamsStore = create(
  persist(
    (set, get) => ({
      teams: SEED_TEAMS,

      // Returns the new id, or null if name was empty/whitespace.
      createTeam: ({ name, sizeBucket, functionType }) => {
        const trimmed = (name ?? '').trim()
        if (!trimmed) return null

        const teams = get().teams
        const base = slugify(trimmed)
        let id = base
        let n = 2
        while (teams[id]) {
          id = `${base}-${n}`
          n += 1
        }

        const team = {
          id,
          name: trimmed,
          cohort: {
            sizeBucket: sizeBucket?.trim() || 'Unspecified',
            functionType: functionType?.trim() || 'Unspecified',
          },
          capabilities: [],
          createdAt: Date.now(),
        }
        set((s) => ({ teams: { ...s.teams, [id]: team } }))
        return id
      },

      // Never changes `id`. `patch` may include name, sizeBucket,
      // functionType, capabilities — any subset.
      updateTeam: (id, patch) =>
        set((s) => {
          const existing = s.teams[id]
          if (!existing) return {}
          const next = { ...existing }
          if (patch.name?.trim()) next.name = patch.name.trim()
          if (patch.sizeBucket !== undefined || patch.functionType !== undefined) {
            next.cohort = {
              sizeBucket: patch.sizeBucket?.trim() || existing.cohort.sizeBucket,
              functionType: patch.functionType?.trim() || existing.cohort.functionType,
            }
          }
          if (patch.capabilities !== undefined) next.capabilities = patch.capabilities
          return { teams: { ...s.teams, [id]: next } }
        }),

      deleteTeam: (id) =>
        set((s) => {
          if (!s.teams[id]) return {}
          const next = { ...s.teams }
          delete next[id]
          return { teams: next }
        }),
    }),
    { name: 'growth.teams.v1', version: 1, partialize: (s) => ({ teams: s.teams }) }
  )
)

export const listTeams = (state) => Object.values(state.teams)
