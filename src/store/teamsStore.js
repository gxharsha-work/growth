import { create } from 'zustand'
import { api, probeApi } from '../lib/api'

// Owns the team list itself (id, name, cohort, suggested capabilities).
//
// Backed by the shared D1 database via /api/teams when it's reachable, so
// every viewer sees the same teams — not just the ones created in their own
// browser. When no backend is reachable (e.g. running plain `npm run dev`
// without `wrangler pages dev`), falls back to the old local-only
// behavior: an in-memory seed, mutated directly, gone on reload. Either
// way, a team's `id` is never regenerated once assigned (villageStore and
// signalsStore key everything off it).

function slugify(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'team'
  )
}

// Local-fallback seed, and also what `teams` starts as before hydrate()
// resolves — so the UI has something to render on the very first paint
// instead of a blank team switcher. createdAt: 0 marks these as pre-dating
// real creation tracking (the backend's migrations/0002_seed.sql seeds the
// same three teams with the same ids/createdAt for parity).
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

function localCreate(teams, { name, sizeBucket, functionType }) {
  const base = slugify(name)
  let id = base
  let n = 2
  while (teams[id]) {
    id = `${base}-${n}`
    n += 1
  }
  return {
    id,
    name,
    cohort: { sizeBucket: sizeBucket?.trim() || 'Unspecified', functionType: functionType?.trim() || 'Unspecified' },
    capabilities: [],
    createdAt: Date.now(),
  }
}

export const useTeamsStore = create((set, get) => ({
  teams: SEED_TEAMS,
  hydrated: false,

  // Called once, at app startup (see App.jsx). Replaces the local seed with
  // the backend's team list if one is reachable; otherwise leaves the seed
  // in place and everything after this just operates locally for the
  // session.
  hydrate: async () => {
    if (get().hydrated) return
    const reachable = await probeApi()
    if (!reachable) {
      set({ hydrated: true })
      return
    }
    try {
      const list = await api.get('/teams')
      set({ teams: Object.fromEntries(list.map((t) => [t.id, t])), hydrated: true })
    } catch (err) {
      console.error('Failed to load teams from backend, using local seed:', err)
      set({ hydrated: true })
    }
  },

  // Returns the new id, or null if name was empty/whitespace.
  createTeam: async ({ name, sizeBucket, functionType }) => {
    const trimmed = (name ?? '').trim()
    if (!trimmed) return null

    if (await probeApi()) {
      try {
        const team = await api.post('/teams', { name: trimmed, sizeBucket, functionType })
        set((s) => ({ teams: { ...s.teams, [team.id]: team } }))
        return team.id
      } catch (err) {
        console.error('Failed to create team on backend, creating locally only:', err)
      }
    }

    const team = localCreate(get().teams, { name: trimmed, sizeBucket, functionType })
    set((s) => ({ teams: { ...s.teams, [team.id]: team } }))
    return team.id
  },

  // Never changes `id`. `patch` may include name, sizeBucket, functionType,
  // capabilities — any subset.
  updateTeam: async (id, patch) => {
    const existing = get().teams[id]
    if (!existing) return

    if (await probeApi()) {
      try {
        const team = await api.patch(`/teams/${id}`, patch)
        set((s) => ({ teams: { ...s.teams, [id]: team } }))
        return
      } catch (err) {
        console.error('Failed to update team on backend, updating locally only:', err)
      }
    }

    const next = { ...existing }
    if (patch.name?.trim()) next.name = patch.name.trim()
    if (patch.sizeBucket !== undefined || patch.functionType !== undefined) {
      next.cohort = {
        sizeBucket: patch.sizeBucket?.trim() || existing.cohort.sizeBucket,
        functionType: patch.functionType?.trim() || existing.cohort.functionType,
      }
    }
    if (patch.capabilities !== undefined) next.capabilities = patch.capabilities
    set((s) => ({ teams: { ...s.teams, [id]: next } }))
  },

  deleteTeam: async (id) => {
    if (!get().teams[id]) return
    if (await probeApi()) {
      try {
        await api.delete(`/teams/${id}`)
      } catch (err) {
        console.error('Failed to delete team on backend, removing locally only:', err)
      }
    }
    set((s) => {
      const next = { ...s.teams }
      delete next[id]
      return { teams: next }
    })
  },
}))

export const listTeams = (state) => Object.values(state.teams)
