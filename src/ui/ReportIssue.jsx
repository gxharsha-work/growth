/* global __GROWTH_BUILD__ */
import { useState } from 'react'
import { MessageSquareWarning, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore } from '../store/appStore'

const BUILD_SHA = typeof __GROWTH_BUILD__ !== 'undefined' ? __GROWTH_BUILD__.sha : 'dev'

// "Report an issue": saves the message, the page state (team and week) and
// the build SHA to D1. Only admins can read reports (GET /api/feedback).
export default function ReportIssue() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)

  async function send() {
    if (!message.trim()) return
    setState('sending')
    try {
      await api.post('/feedback', {
        message: message.trim(),
        page: `${window.location.pathname} team=${currentTeam ?? '-'} week=${currentWeek + 1}`,
        buildSha: BUILD_SHA,
      })
      setMessage('')
      setState('sent')
    } catch {
      setState('error')
    }
  }

  return (
    <>
      <button className="legend-toggle glass" onClick={() => { setOpen((o) => !o); setState('idle') }} aria-expanded={open} aria-controls="report-issue">
        <MessageSquareWarning size={16} />
        <span>Report an issue</span>
      </button>
      {open && (
        <div id="report-issue" className="legend-panel glass" role="dialog" aria-label="Report an issue">
          <div className="legend-head">
            <strong>Report an issue</strong>
            <button className="legend-close" onClick={() => setOpen(false)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          {state === 'sent' ? (
            <p role="status">Thank you. Your report was saved with this page and build ({BUILD_SHA.slice(0, 7)}).</p>
          ) : (
            <>
              <label className="report-label" htmlFor="report-text">What went wrong or what was confusing?</label>
              <textarea
                id="report-text"
                className="report-text"
                value={message}
                maxLength={2000}
                rows={4}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="report-hint">Sent with your email, the current team and week, and the build. No other data.</p>
              <button className="report-send" disabled={!message.trim() || state === 'sending'} onClick={send}>
                {state === 'sending' ? 'Sending' : 'Send report'}
              </button>
              {state === 'error' && <p role="status">Could not send the report. Please try again.</p>}
            </>
          )}
        </div>
      )}
    </>
  )
}
