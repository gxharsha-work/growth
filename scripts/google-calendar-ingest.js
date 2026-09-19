// Pulls real meeting-load signal from Kristen's Google Calendar and writes
// it into src/data/calendarSignals.generated.json, where mockSignals.js
// merges it into WEEKLY_SIGNALS as the "solstice" team's calendar signal
// (see FR6 in the Sprint 2 doc). Requires npm run auth:calendar to have
// been run once first.
//
// Run via: npm run ingest:calendar

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { getIsoWeek } from './lib/iso-week.js'

const TEAM_ID = 'solstice'
const TOKEN_PATH = fileURLToPath(new URL('../.google-calendar-token.json', import.meta.url))
const OUTPUT_PATH = fileURLToPath(
  new URL('../src/data/calendarSignals.generated.json', import.meta.url)
)

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`
    )
  }
  return value
}

const CLIENT_ID = requireEnv('GOOGLE_CALENDAR_CLIENT_ID')
const CLIENT_SECRET = requireEnv('GOOGLE_CALENDAR_CLIENT_SECRET')

async function getAccessToken() {
  let refreshToken
  try {
    const stored = JSON.parse(await readFile(TOKEN_PATH, 'utf8'))
    refreshToken = stored.refresh_token
  } catch {
    throw new Error('No .google-calendar-token.json found. Run: npm run auth:calendar')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`)
  }
  const data = await res.json()
  return data.access_token
}

async function getRecentEvents(accessToken, timeMin, timeMax) {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', timeMin.toISOString())
  url.searchParams.set('timeMax', timeMax.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '250')

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    throw new Error(`Calendar events request failed (${res.status}): ${await res.text()}`)
  }
  const data = await res.json()
  return data.items ?? []
}

// v1 heuristic for "this counts as a meeting": a timed (non-all-day),
// non-cancelled event with at least one other attendee, that the user
// hasn't declined. Doesn't distinguish focus-time blocks with attendees,
// or count events with no attendees field at all (e.g. holds someone else
// organized without listing attendees) — documented limitation, not a bug.
function classifyEvent(event) {
  if (event.status === 'cancelled') return { include: false, reason: 'cancelled' }
  if (!event.start?.dateTime) return { include: false, reason: 'all-day event' }

  const attendees = event.attendees ?? []
  const self = attendees.find((a) => a.self)
  if (self?.responseStatus === 'declined') return { include: false, reason: 'declined' }
  if (attendees.length < 2) return { include: false, reason: 'no other attendees' }

  const start = new Date(event.start.dateTime)
  const end = new Date(event.end.dateTime)
  const hours = (end - start) / 3600000
  return { include: true, hours }
}

async function main() {
  const accessToken = await getAccessToken()

  // "This week" (Monday 00:00 through next Monday 00:00, local time) rather
  // than a trailing 7-day window — meeting *load* should include meetings
  // already on the calendar for the rest of this week, not just ones that
  // already happened.
  const now = new Date()
  const dayOfWeek = now.getDay() || 7 // Mon=1 .. Sun=7
  const timeMin = new Date(now)
  timeMin.setHours(0, 0, 0, 0)
  timeMin.setDate(timeMin.getDate() - dayOfWeek + 1)
  const timeMax = new Date(timeMin)
  timeMax.setDate(timeMin.getDate() + 7)

  const events = await getRecentEvents(accessToken, timeMin, timeMax)

  let totalHours = 0
  const details = []
  console.log(`Events from ${timeMin.toISOString()} to ${timeMax.toISOString()}:`)
  for (const event of events) {
    const result = classifyEvent(event)
    const title = event.summary ?? '(untitled)'
    if (result.include) {
      totalHours += result.hours
      console.log(`  ✓ ${title}: ${result.hours.toFixed(1)}h`)
      details.push({ title, hours: Math.round(result.hours * 10) / 10, included: true, reason: null })
    } else {
      console.log(`  ✗ ${title}: excluded (${result.reason})`)
      details.push({ title, hours: null, included: false, reason: result.reason })
    }
  }

  const avgMeetingHoursPerWeek = Math.round(totalHours * 10) / 10
  const isoWeek = getIsoWeek(now)

  let data = {}
  try {
    data = JSON.parse(await readFile(OUTPUT_PATH, 'utf8'))
  } catch {
    // no file yet — start fresh
  }

  const teamWeeks = data[TEAM_ID] ?? []
  const existingIndex = teamWeeks.findIndex((row) => row.isoWeek === isoWeek)
  const newRow = { isoWeek, calendar: { avgMeetingHoursPerWeek, details } }

  data[TEAM_ID] =
    existingIndex >= 0
      ? [...teamWeeks.slice(0, existingIndex), newRow, ...teamWeeks.slice(existingIndex + 1)]
      : [...teamWeeks, newRow]

  await writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2) + '\n')

  console.log('\nSummary:')
  console.table([{ team: TEAM_ID, isoWeek, avgMeetingHoursPerWeek }])
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
