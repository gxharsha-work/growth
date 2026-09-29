// Ported from src/logic/meetingLoad.js — same "this week" window and
// "counts as a meeting" heuristic, kept in sync by hand since this Worker
// is bundled independently (see isoWeek.ts's comment).

export function getCurrentWeekWindow(now = new Date()) {
  const dayOfWeek = now.getDay() || 7 // Mon=1 .. Sun=7
  const timeMin = new Date(now)
  timeMin.setHours(0, 0, 0, 0)
  timeMin.setDate(timeMin.getDate() - dayOfWeek + 1)
  const timeMax = new Date(timeMin)
  timeMax.setDate(timeMin.getDate() + 7)
  return { timeMin, timeMax }
}

type GCalEvent = {
  status?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  attendees?: { self?: boolean; responseStatus?: string }[]
}

export function classifyEvent(event: GCalEvent): { include: boolean; reason?: string; hours?: number } {
  if (event.status === 'cancelled') return { include: false, reason: 'cancelled' }
  if (!event.start?.dateTime) return { include: false, reason: 'all-day event' }

  const attendees = event.attendees ?? []
  const self = attendees.find((a) => a.self)
  if (self?.responseStatus === 'declined') return { include: false, reason: 'declined' }
  if (attendees.length < 2) return { include: false, reason: 'no other attendees' }

  const start = new Date(event.start.dateTime)
  const end = new Date(event.end!.dateTime!)
  const hours = (end.getTime() - start.getTime()) / 3600000
  return { include: true, hours }
}
