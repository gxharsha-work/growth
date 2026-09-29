# Growth

A toon-shaded 3D village that visualizes a team's health — built with Vite,
React, `@react-three/fiber`/`drei`, and `zustand` on the frontend, and
Cloudflare Pages + Workers + D1 on the backend (free tier only — see
[`DEPLOY.md`](./DEPLOY.md)).

## What's here

- **Free-form capabilities**: any team names its own capabilities (not a
  fixed Frontend/Backend/QA/DevOps list) — each becomes a building on an
  organic floating island, auto-shaped from its name (lighthouse, windmill,
  observatory, pagoda, crystal spire, forge, rocket, bazaar), always
  overridable.
- **Knowledge Commons**: a fixed shared plaza + garden at the center of
  every team's island, driven by review-turnaround speed. Collaboration
  paths are auto-drawn from it to every capability.
- **Dynamic teams**: create, rename, and delete teams at runtime from the
  HUD — no code changes, no reload.
- **Team comparison picker**: pick any 2–4 teams to view side by side,
  rather than a fixed pair.
- **Data → health score pipeline**: a composite score per team, computed
  client-side from Jira/GitHub/Calendar-shaped weekly signals
  (`src/logic/healthScore.js`) with an early-warning rule. Two demo teams
  (Platform, Backend) run on hand-tuned mock signals; one (Solstice) runs on
  real, ingested Jira + Calendar data; any other team gets a deterministic
  generated fallback so it's never a dead village.
- **Visuals driven by data**: weather (sunny/partly-cloudy/rain), lighting,
  and building condition ease smoothly as you scrub through the 8-week
  timeline or switch teams.
- **Click-to-view-details**: click any building (or the Commons) for a
  popup showing its current signal, with an inline editor for name/shape/
  notes.

## Running locally

Frontend only (fastest for UI iteration — falls back to local seed data,
no backend):

```bash
npm install
npm run dev
```

With the real backend (D1-backed, matches production — see `DEPLOY.md` for
one-time setup):

```bash
npm run build
npx wrangler d1 migrations apply growth-db --local   # first time only
npx wrangler pages dev dist
```

```bash
npm run build    # production build
npm run lint      # oxlint
npx tsc --noEmit  # type-check functions/ (the backend API)
```

## Assets & licensing

No external 3D models are used — every building/prop in the scene is
hand-built from primitive geometry (boxes, cones, cylinders) styled with
`MeshToonMaterial`, so there are no asset-licensing concerns.

## Project structure

```
src/
  data/       team roster seed data, archetype (building shape) definitions
  logic/      scoring, early-warning, and data→visual helper functions
  lib/        API client for the backend
  store/      zustand stores — teams, village/buildings, signals, app/UI state
  scene/      all react-three-fiber scene components and 3D building models
  ui/         2D HTML/CSS overlay (panel, HUD, timeline, popups)

functions/api/   Cloudflare Pages Functions — the REST API (Hono), reads/writes D1
migrations/      D1 schema + seed data
worker-ingestion/ separate Worker: daily Cron Trigger pulling Jira + Calendar into D1
scripts/         local-only one-off scripts (Google Calendar OAuth setup)
```

See [`DEPLOY.md`](./DEPLOY.md) for how the two Cloudflare projects
(`growth` and `growth-ingestion`) and the shared D1 database fit together,
and exactly what to run to deploy.
