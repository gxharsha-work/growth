import { useState, useEffect } from 'react'
import { Link2 } from 'lucide-react'
import { getCurrentWeekWindow, classifyEvent } from '../logic/meetingLoad'
import { SignalPill, CalendarDetailsList } from './SignalPill'

// Lightweight, session-only "connect your own Google Calendar" preview.
// Uses Google Identity Services' client-side OAuth token flow (a popup,
// no client secret) so anyone can click Connect without creating their own
// Google Cloud project — unlike scripts/google-calendar-ingest.js, which
// needs a one-time CLI OAuth setup (npm run auth:calendar) to get a
// long-lived refresh token. This access token only lasts ~1 hour and is
// never persisted; refreshing the page means connecting again.
//
// Deliberately NOT wired into WEEKLY_SIGNALS/teamHealth.js — this is a
// standalone readout of "what would my calendar contribute", not a way to
// override the Solstice team's stored score.
//
// IMPORTANT caveat, not fixable from code: the OAuth app is still in
// Google's "Testing" publishing status, so only accounts added to the
// OAuth consent screen's Test users list can actually connect. Anyone else
// will see Google's "Access blocked" error below (shown as-is, not
// swallowed, so it's obvious why it failed).

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_WEB_CLIENT_ID

let gisScriptPromise = null
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!gisScriptPromise) {
    gisScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.onload = resolve
      script.onerror = () => reject(new Error('Failed to load Google Identity Services script'))
      document.head.appendChild(script)
    })
  }
  return gisScriptPromise
}

async function fetchThisWeeksEvents(accessToken) {
  const { timeMin, timeMax } = getCurrentWeekWindow()
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

export default function ConnectCalendar() {
  const [status, setStatus] = useState('idle') // idle | loading-gis | connecting | connected | error
  const [result, setResult] = useState(null) // { avgMeetingHoursPerWeek, details }
  const [errorMessage, setErrorMessage] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [gisReady, setGisReady] = useState(false)

  // Preload the GIS script on mount rather than on click: requestAccessToken()
  // opens a popup, and browsers only allow that when it's called synchronously
  // from within a user gesture's call stack. Awaiting the script load inside
  // the click handler breaks that chain and the popup gets silently blocked.
  useEffect(() => {
    if (!CLIENT_ID) return
    loadGis()
      .then(() => setGisReady(true))
      .catch((err) => {
        setStatus('error')
        setErrorMessage(err.message)
      })
  }, [])

  if (!CLIENT_ID) {
    return (
      <div className="hud-signal hud-signal--muted glass">
        Set VITE_GOOGLE_CALENDAR_WEB_CLIENT_ID in .env to enable "Connect your Google Calendar".
      </div>
    )
  }

  function handleConnect() {
    if (!gisReady) return
    setStatus('connecting')
    setErrorMessage('')
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            setStatus('error')
            setErrorMessage(`${tokenResponse.error}: ${tokenResponse.error_description ?? ''}`)
            return
          }
          try {
            const events = await fetchThisWeeksEvents(tokenResponse.access_token)
            let totalHours = 0
            const details = events.map((event) => {
              const classified = classifyEvent(event)
              const title = event.summary ?? '(untitled)'
              if (classified.include) {
                totalHours += classified.hours
                return { title, hours: Math.round(classified.hours * 10) / 10, included: true, reason: null }
              }
              return { title, hours: null, included: false, reason: classified.reason }
            })
            setResult({ avgMeetingHoursPerWeek: Math.round(totalHours * 10) / 10, details })
            setStatus('connected')
          } catch (err) {
            setStatus('error')
            setErrorMessage(err.message)
          }
        },
      })
      tokenClient.requestAccessToken()
    } catch (err) {
      setStatus('error')
      setErrorMessage(err.message)
    }
  }

  if (status === 'connected' && result) {
    return (
      <SignalPill
        icon={<Link2 size={15} />}
        label={`Your calendar: ${result.avgMeetingHoursPerWeek}h this week`}
        details={result.details}
        renderDetails={(d) => <CalendarDetailsList details={d} />}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
      />
    )
  }

  return (
    <div className="hud-signal">
      <button className="hud-signal-toggle glass" onClick={handleConnect} disabled={!gisReady || status === 'connecting'}>
        <span className="hud-signal-icon">
          <Link2 size={15} />
        </span>
        <span className="hud-signal-label">
          {!gisReady ? 'Loading...' : status === 'connecting' ? 'Connecting...' : 'Connect your Google Calendar'}
        </span>
      </button>
      {status === 'error' && (
        <div className="hud-signal-details hud-signal-details--error glass">{errorMessage}</div>
      )}
    </div>
  )
}
