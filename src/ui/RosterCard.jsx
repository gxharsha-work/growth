import { useEffect, useRef, useState } from 'react'
import { Users, Upload } from 'lucide-react'
import { api, probeApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useSignalsStore } from '../store/signalsStore'

// Roster and opt-in consent for one team (FR4, FR18).
// Shows consent coverage ("4 of 6 opted in"); a team lead can record each
// member's opt-in and import a roster CSV (name, role, team, consented).
// The server enforces the rule: live data is withheld until 3 members opt in.
export default function RosterCard({ teamId }) {
  const canEdit = useAuthStore((s) => s.role) === 'manager'
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const [refreshing, setRefreshing] = useState(false)
  const reloadSignals = useSignalsStore((s) => s.reloadSignals)
  const [roster, setRoster] = useState(null) // { members, consent } | 'offline' | 'error'
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    // Keyed by team in TeamHUD, so state starts fresh for each team.
    let cancelled = false
    ;(async () => {
      if (!(await probeApi())) {
        if (!cancelled) setRoster('offline')
        return
      }
      try {
        const data = await api.get(`/teams/${teamId}/roster`)
        if (!cancelled) setRoster(data)
      } catch {
        if (!cancelled) setRoster('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [teamId])

  if (roster === 'offline' || roster === null) return null
  if (roster === 'error') {
    return <div className="hud-signal hud-signal--muted glass">The roster could not be loaded. Refresh to try again.</div>
  }

  const { members, consent } = roster
  const applyChange = async (next) => {
    setRoster(next)
    await reloadSignals(teamId) // the server re-decides whether the score is shown
  }

  async function toggle(member) {
    setMessage('')
    try {
      await api.patch(`/roster/${member.id}`, { consented: !member.consented })
      await applyChange(await api.get(`/teams/${teamId}/roster`))
    } catch {
      setMessage('Could not save that change. Please try again.')
    }
  }

  // Admin: re-run ingestion now so consent changes reach the GitHub numbers today.
  async function refreshData() {
    setMessage('')
    setRefreshing(true)
    try {
      await api.post('/admin/refresh', {})
      await reloadSignals(teamId)
      setMessage('Data refreshed from Jira, calendar and GitHub.')
    } catch {
      setMessage('Could not refresh the data right now. The daily refresh runs at 13:00 UTC.')
    } finally {
      setRefreshing(false)
    }
  }

  async function importFile(file) {
    setMessage('')
    try {
      const csv = await file.text()
      const res = await fetch('/api/teams/' + encodeURIComponent(teamId) + '/roster/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const first = body.errors?.[0]
        setMessage(first ? `Not imported. Line ${first.line}: ${first.message}.` : `Not imported: ${body.error ?? 'unknown error'}.`)
        return
      }
      await applyChange({ members: body.members, consent: body.consent })
      setMessage(`Imported ${body.imported} member${body.imported === 1 ? '' : 's'}.`)
    } catch {
      setMessage('Could not read that file.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="hud-roster glass">
      <button className="hud-roster-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Users size={14} />
        <span>
          Roster: {consent.consented} of {consent.total} opted in
        </span>
      </button>
      {!consent.scoreAllowed && (
        <p className="hud-roster-note" role="status">
          Score hidden. Growth scores a team only after at least {consent.minConsented} members opt in.
        </p>
      )}
      {open && (
        <>
          <ul className="hud-roster-list">
            {members.length === 0 && <li className="hud-roster-empty">No members yet. Import a roster CSV.</li>}
            {members.map((m) => (
              <li key={m.id}>
                <label>
                  <input type="checkbox" checked={m.consented} disabled={!canEdit} onChange={() => toggle(m)} />
                  <span className="hud-roster-name">{m.name}</span>
                  <span className="hud-roster-role">{m.role}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="hud-roster-hint">
            Ticked = opted in. Consent is recorded by the team lead after each member agrees.
          </p>
          {canEdit && (
            <>
              <button className="hud-roster-import" onClick={() => fileRef.current?.click()}>
                <Upload size={13} /> Import CSV
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
              />
              <p className="hud-roster-hint">Columns: name, role, team, consented (yes or no).</p>
            </>
          )}
          {isAdmin && (
            <>
              <button className="hud-roster-import" onClick={refreshData} disabled={refreshing}>
                {refreshing ? 'Refreshing' : 'Refresh data now'}
              </button>
              <p className="hud-roster-hint">GitHub counts only opted-in members. Data also refreshes daily.</p>
            </>
          )}
        </>
      )}
      {message && (
        <p className="hud-roster-note" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
