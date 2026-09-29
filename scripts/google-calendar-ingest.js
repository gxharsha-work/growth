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
import { getCurrentWeekWindow, classifyEvent } from '../src/logic/meetingLoad.js'

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

async function main() {
  const accessToken = await getAccessToken()

  const now = new Date()
  const { timeMin, timeMax } = getCurrentWeekWindow(now)

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
