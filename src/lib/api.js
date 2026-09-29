// Thin fetch wrapper for Growth's backend API (functions/api/, served at
// /api/* by Cloudflare Pages Functions — same-origin in production, and
// under `wrangler pages dev` in local dev too).
//
// Every store that talks to this treats a failed `probeApi()` as "no
// backend reachable" and falls back to its old local-only seed behavior,
// so plain `npm run dev` (Vite alone, no Functions running) still works
// for quick frontend iteration — see teamsStore.js / villageStore.js /
// signalsStore.js.

const BASE = '/api'

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${options?.method ?? 'GET'} ${path} failed (${res.status}): ${body}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}

// One-time, cached probe: is a real backend reachable? Used at each store's
// first read so a dev running plain `vite` doesn't see failed-fetch errors
// on every action, just once at startup.
let probePromise = null
export function probeApi() {
  if (!probePromise) {
    probePromise = api
      .get('/teams')
      .then(() => true)
      .catch(() => false)
  }
  return probePromise
}
