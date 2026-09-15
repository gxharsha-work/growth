# Growth

A cute, toon-shaded 3D village that visualizes a team's health — built with
Vite, React, `@react-three/fiber`/`drei`, and `zustand`. This is a local,
browser-based prototype; there is no backend and no real API integrations.

## What's here

- **Village scene**: an 8×8 grid where you place and drag around Capability
  Buildings (Frontend/Backend/QA/DevOps skill coverage), a Knowledge Garden,
  a Landmark, and Collaboration Road segments.
- **Mock data → health score pipeline**: two fictional teams ("Platform
  Team", "Backend Team") with 8 weeks of hand-tuned mock Jira/GitHub/Calendar
  signals (`src/data`), fed through a placeholder weighted-average scoring
  module (`src/logic/healthScore.js`) with a simple early-warning rule.
- **Visuals driven by data**: weather (sunny/partly-cloudy/rain), lighting,
  building condition, and garden vibrancy all ease smoothly as you scrub
  through the 8-week timeline or switch teams.
- **Peer comparison view**: both team villages side by side, read-only, each
  showing that week's score and weather.
- **Click-to-view-details**: click any placed item for a popup showing its
  type, description, and (for data-driven types) the current signal behind
  its look — with a small inline editor for a custom name/notes.

## Running locally

```bash
npm install
npm run dev
```

Then open the printed local URL (typically http://localhost:5173).

```bash
npm run build    # production build
npm run lint      # oxlint
```

## Assets & licensing

No external 3D models are used — every building/prop in the scene is
hand-built from primitive geometry (boxes, cones, cylinders) styled with
`MeshToonMaterial`, so there are no asset-licensing concerns.

## Project structure

```
src/
  data/     mock team rosters + weekly Jira/GitHub/Calendar signals
  logic/    scoring, early-warning, and data→visual helper functions
  store/    zustand stores (village/building state, app/team/week state)
  scene/    all react-three-fiber scene components and 3D models
  ui/       2D HTML/CSS overlay (sidebar, HUD, timeline, popups)
```
