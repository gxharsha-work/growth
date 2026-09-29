// Ported from scripts/google-calendar-ingest.js. Uses the long-lived
// refresh token obtained once via `npm run auth:calendar` (the loopback
// OAuth flow only makes sense interactively, so that step still happens
// locally — see DEPLOY.md — and only the resulting refresh token moves to
// this Worker, as a secret).
import { getCurrentWeekWindow, classifyEvent } from './meetingLoad'

export type CalendarEnv = {
  GOOGLE_CALENDAR_CLIENT_ID: string
  GOOGLE_CALENDAR_CLIENT_SECRET: string
  GOOGLE_CALENDAR_REFRESH_TOKEN: string
}

async function getAccessToken(env: CalendarEnv): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: env.GOOGLE_CALENDAR_REFRESH_TOKEN,
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID,
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`)
  const data = await res.json<{ access_token: string }>()
  return data.access_token
}

export async function runCalendarIngestion(env: CalendarEnv, log: string[]) {
  const accessToken = await getAccessToken(env)
  const { timeMin, timeMax } = getCurrentWeekWindow(new Date())

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', timeMin.toISOString())
  url.searchParams.set('timeMax', timeMax.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '250')

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Calendar events request failed (${res.status}): ${await res.text()}`)
  const data = await res.json<{ items?: unknown[] }>()
  const events = (data.items ?? []) as Parameters<typeof classifyEvent>[0][]

  let totalHours = 0
  const details = events.map((event) => {
    const result = classifyEvent(event)
    const title = (event as { summary?: string }).summary ?? '(untitled)'
    if (result.include) {
      totalHours += result.hours!
      return { title, hours: Math.round(result.hours! * 10) / 10, included: true, reason: null }
    }
    return { title, hours: null, included: false, reason: result.reason ?? null }
  })

  log.push(`Calendar: ${events.length} events in window, ${Math.round(totalHours * 10) / 10}h counted`)

  return { avgMeetingHoursPerWeek: Math.round(totalHours * 10) / 10, details }
}
