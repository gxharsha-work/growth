// Shared, pure meeting-load logic used by both the Node ingestion script
// (scripts/google-calendar-ingest.js) and the browser "Connect your Google
// Calendar" preview (src/ui/ConnectCalendar.jsx) — no Node-only APIs here,
// so it can run in either environment unchanged.

// "This week" (Monday 00:00 through next Monday 00:00, local time) rather
// than a trailing 7-day window — meeting *load* should include meetings
// already on the calendar for the rest of this week, not just ones that
// already happened.
export function getCurrentWeekWindow(now = new Date()) {
  const dayOfWeek = now.getDay() || 7 // Mon=1 .. Sun=7
  const timeMin = new Date(now)
  timeMin.setHours(0, 0, 0, 0)
  timeMin.setDate(timeMin.getDate() - dayOfWeek + 1)
  const timeMax = new Date(timeMin)
  timeMax.setDate(timeMin.getDate() + 7)
  return { timeMin, timeMax }
}

// v1 heuristic for "this counts as a meeting": a timed (non-all-day),
// non-cancelled event with at least one other attendee, that the user
// hasn't declined. Doesn't distinguish focus-time blocks with attendees,
// or count events with no attendees field at all (e.g. holds someone else
// organized without listing attendees) — documented limitation, not a bug.
export function classifyEvent(event) {
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
