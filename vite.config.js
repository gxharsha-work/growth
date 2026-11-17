import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Build identity: the commit this bundle was built from ("-dirty" if the tree
// had uncommitted changes). Shown in the UI footer and served as /build.json,
// which GET /api/health reports.
function buildInfo() {
  const git = (cmd) => {
    try {
      return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return ''
    }
  }
  const sha = git('rev-parse HEAD') || 'unknown'
  const dirty = git('status --porcelain') !== ''
  return { sha: dirty ? `${sha}-dirty` : sha, builtAt: new Date().toISOString(), version: '0.9.0-beta' }
}
const BUILD = buildInfo()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'growth-build-info',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify(BUILD) })
      },
    },
  ],
  define: { __GROWTH_BUILD__: JSON.stringify(BUILD) },
})
