// FR17: team-level aggregates only. Fails if raw ticket summaries or event titles are stored in the
// bundled signal files, or if an ingest writer puts them back into `details`.
import { readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => { console.error('FAIL ' + m); bad++ }

function walk(o, path, file) {
  if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${path}[${i}]`, file))
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if ((k === 'summary' || k === 'title') && typeof v === 'string') fail(`${file}: ${path}.${k} holds raw text`)
      else walk(v, `${path}.${k}`, file)
    }
  }
}
for (const f of ['src/data/jiraSignals.generated.json', 'src/data/calendarSignals.generated.json']) {
  walk(JSON.parse(readFileSync(f, 'utf8')), '$', f)
}
const writers = {
  'scripts/jira-ingest.js': /summary:\s*issue\.fields\.summary/,
  'worker-ingestion/src/jira.ts': /summary:\s*issue\.fields\.summary/,
  'scripts/google-calendar-ingest.js': /details\.push\(\{\s*title/,
  'worker-ingestion/src/calendar.ts': /return \{ title,/,
}
for (const [f, re] of Object.entries(writers)) if (re.test(readFileSync(f, 'utf8'))) fail(`${f}: writes raw text into details`)
console.log(bad ? `${bad} failure(s)` : 'ALL PASSED: no raw ticket/event text in data files or ingest writers')
process.exit(bad ? 1 : 0)
