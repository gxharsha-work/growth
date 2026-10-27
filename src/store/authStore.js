import { create } from 'zustand'
import { api, probeApi } from '../lib/api'

// Who the current viewer is and what they may do. Role comes from GET /api/me,
// which the backend derives from the verified Cloudflare Access identity — the
// frontend never decides its own role, it only mirrors what the server says so
// it can hide controls a 'leadership' (read-only) user isn't allowed to use.
// (The backend still enforces every write; this is UX, not the security boundary.)
//
// Offline / plain `npm run dev` (no backend reachable): default to 'manager'
// so local UI iteration keeps full controls. Backend reachable but no role
// assigned: fall back to least privilege ('leadership').
export const useAuthStore = create((set, get) => ({
  role: 'manager',
  roleLoaded: false,

  loadRole: async () => {
    if (get().roleLoaded) return
    if (!(await probeApi())) {
      set({ roleLoaded: true })
      return
    }
    try {
      const me = await api.get('/me')
      set({ role: me.role === 'manager' ? 'manager' : 'leadership', roleLoaded: true })
    } catch {
      set({ role: 'leadership', roleLoaded: true })
    }
  },
}))

export const canWrite = () => useAuthStore.getState().role === 'manager'
