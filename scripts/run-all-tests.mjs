// One command for every automated check in the repo: unit tests, the API
// stress suite, and the Sprint 8 validation suite as a regression gate.
//
// The validation scripts are deterministic (fixed seeds), so their committed
// outputs under eval/validation/ must reproduce byte for byte. Any diff there
// means a change moved a Sprint 7/8 result, and this runner fails.
//
// Run: npm test            (everything)
//      npm test -- --quick (skip the slower validation suite)

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const quick = process.argv.includes('--quick')

const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// Unit and contract tests: exit code is the verdict.
const UNIT = [
  'scripts/test-facts-validate.mjs',
  'scripts/test-sprint-align.mjs',
  'scripts/test-scoring-parity.mjs',
  'scripts/test-no-raw-text.mjs',
  'scripts/test-api-no-raw-text.mjs',
]
for (const file of UNIT) {
  const r = run('node', ['--no-warnings', file])
  const last = (r.stdout || r.stderr).trim().split('\n').pop()
  check(file, r.status === 0, last)
}

// Stress suite: always exits 0 and reports "N of M tests pass".
{
  const r = run('node', ['--no-warnings', 'scripts/stress-test.mjs'])
  const m = /\*\*(\d+) of (\d+) tests pass/.exec(r.stdout ?? '')
  check('scripts/stress-test.mjs', !!m && m[1] === m[2], m ? `${m[1]} of ${m[2]}` : 'no summary')
}

// Sprint 8 validation suite: regenerate, then require zero diff.
if (!quick) {
  for (const args of [
    ['scripts/validation/simulate.mjs', '--set=both'],
    ['scripts/validation/faithfulness.mjs'],
    ['scripts/validation/replay-sprint5.mjs', '--out=after/replay_after.md'],
    ['scripts/validation/persignal.mjs', '--final', '--k=1.5', '--h=14'],
  ]) {
    const r = run('node', ['--no-warnings', ...args])
    check(args.join(' '), r.status === 0, r.status === 0 ? '' : (r.stderr || '').trim().split('\n').pop())
  }
  const diff = run('git', ['status', '--porcelain', '--', 'eval/validation'])
  const changed = diff.stdout.trim()
  check('eval/validation unchanged (Sprint 8 results reproduce)', changed === '', changed.replace(/\n/g, '; '))
}

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed} of ${results.length} checks pass`)
process.exit(failed ? 1 : 0)
