/* global __GROWTH_BUILD__ */
// "Beta v0.9 · build abc1234": which release and commit this page is.
// __GROWTH_BUILD__ is injected by vite.config.js at build time.
const BUILD = typeof __GROWTH_BUILD__ !== 'undefined' ? __GROWTH_BUILD__ : { sha: 'dev', version: '0.9.0-beta' }

export default function BuildFooter() {
  const short = BUILD.sha.slice(0, 7) + (BUILD.sha.endsWith('-dirty') ? '+' : '')
  return (
    <div className="build-footer" title={`Build ${BUILD.sha}${BUILD.builtAt ? `, built ${BUILD.builtAt}` : ''}`}>
      Beta v0.9 · build {short}
    </div>
  )
}
