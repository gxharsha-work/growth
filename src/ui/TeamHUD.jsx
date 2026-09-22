import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  Ticket,
  CalendarDays,
  ArrowLeftRight,
  ArrowLeft,
  TriangleAlert,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useTeamsStore, listTeams } from '../store/teamsStore'
import { getTeamWeek } from '../logic/teamHealth'
import { getSignalSource } from '../data/mockSignals'
import { levelFor } from '../logic/buildingStatus'
import { SignalPill, JiraDetailsList, CalendarDetailsList } from './SignalPill'
import ConnectCalendar from './ConnectCalendar'
import './hud.css'

const RING_RADIUS = 24
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

export default function TeamHUD() {
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)
  const viewMode = useAppStore((s) => s.viewMode)
  const setTeam = useAppStore((s) => s.setTeam)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const compareTeamIds = useAppStore((s) => s.compareTeamIds)
  const toggleCompareTeam = useAppStore((s) => s.toggleCompareTeam)
  const teamComposerOpen = useAppStore((s) => s.teamComposerOpen)
  const openTeamComposer = useAppStore((s) => s.openTeamComposer)
  const closeTeamComposer = useAppStore((s) => s.closeTeamComposer)
  const createTeam = useAppStore((s) => s.createTeam)
  const deleteTeam = useAppStore((s) => s.deleteTeam)

  const teams = useTeamsStore(useShallow(listTeams))
  const updateTeam = useTeamsStore((s) => s.updateTeam)

  const [expandedSignal, setExpandedSignal] = useState(null) // 'jira' | 'calendar' | null
  const [editingId, setEditingId] = useState(null) // null = create mode
  const [name, setName] = useState('')
  const [sizeBucket, setSizeBucket] = useState('')
  const [functionType, setFunctionType] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const inputRef = useRef(null)

  const weekHealth = getTeamWeek(currentTeam, currentWeek)
  const isCompare = viewMode === 'compare'
  const atCap = compareTeamIds.length >= 4

  const sizeBucketOptions = [...new Set(teams.map((t) => t.cohort.sizeBucket))]
  const functionTypeOptions = [...new Set(teams.map((t) => t.cohort.functionType))]

  useEffect(() => {
    if (teamComposerOpen) inputRef.current?.focus()
  }, [teamComposerOpen])

  // drop the two-step delete confirmation if the user wanders off
  useEffect(() => {
    if (!confirmDeleteId) return undefined
    const timer = setTimeout(() => setConfirmDeleteId(null), 2600)
    return () => clearTimeout(timer)
  }, [confirmDeleteId])

  function toggleSignal(signal) {
    setExpandedSignal((current) => (current === signal ? null : signal))
  }

  function closeComposer() {
    closeTeamComposer()
    setEditingId(null)
    setName('')
    setSizeBucket('')
    setFunctionType('')
  }

  function toggleComposer() {
    if (teamComposerOpen) {
      closeComposer()
    } else {
      setEditingId(null)
      openTeamComposer()
    }
  }

  function beginEdit(team) {
    setEditingId(team.id)
    setName(team.name)
    setSizeBucket(team.cohort.sizeBucket)
    setFunctionType(team.cohort.functionType)
    openTeamComposer()
  }

  const trimmedName = name.trim()

  function submitTeam() {
    if (!trimmedName) return
    if (editingId) {
      updateTeam(editingId, { name: trimmedName, sizeBucket, functionType })
    } else {
      const id = createTeam({ name: trimmedName, sizeBucket, functionType })
      if (id) setTeam(id)
    }
    closeComposer()
  }

  function handleRemoveTeam(id) {
    if (confirmDeleteId === id) {
      deleteTeam(id)
      setConfirmDeleteId(null)
    } else {
      setConfirmDeleteId(id)
    }
  }

  return (
    <div className="hud">
      <div className="hud-teams glass" role={isCompare ? 'group' : 'tablist'} aria-label="Team">
        {isCompare && (
          <div className="hud-compare-picker-head">
            <span>{compareTeamIds.length}/4 selected</span>
            {atCap && <span>Max 4 — remove one to add another</span>}
          </div>
        )}

        {teams.map((team) => {
          const row = getTeamWeek(team.id, currentWeek)
          const checked = compareTeamIds.includes(team.id)
          const capped = isCompare && !checked && atCap
          const confirming = confirmDeleteId === team.id
          return (
            <div key={team.id} className="hud-team-row">
              <button
                role={isCompare ? 'checkbox' : 'tab'}
                aria-checked={isCompare ? checked : undefined}
                aria-selected={!isCompare ? currentTeam === team.id : undefined}
                aria-disabled={capped}
                className={`hud-team${
                  !isCompare && currentTeam === team.id ? ' hud-team--active' : ''
                }${isCompare && checked ? ' hud-team--checked' : ''}${capped ? ' hud-team--capped' : ''}`}
                onClick={() => (isCompare ? toggleCompareTeam(team.id) : setTeam(team.id))}
              >
                <span className="hud-team-name">{team.name}</span>
                {row && (
                  <span className={`hud-team-score hud-team-score--${levelFor(row.score)}`}>
                    {row.score}
                  </span>
                )}
              </button>
              {!isCompare && (
                <span className="hud-team-actions">
                  <button
                    className="hud-team-edit"
                    aria-label={`Rename ${team.name}`}
                    onClick={() => beginEdit(team)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className={`hud-team-remove${confirming ? ' hud-team-remove--confirm' : ''}`}
                    aria-label={confirming ? `Confirm delete ${team.name}` : `Delete ${team.name}`}
                    title={confirming ? 'Click again to delete' : 'Delete'}
                    onClick={() => handleRemoveTeam(team.id)}
                  >
                    <Trash2 size={13} />
                    {confirming && <span>Delete?</span>}
                  </button>
                </span>
              )}
            </div>
          )
        })}

        {!isCompare && (
          <button
            className={`hud-team-add${teamComposerOpen ? ' hud-team-add--open' : ''}`}
            onClick={toggleComposer}
            aria-expanded={teamComposerOpen}
          >
            <Plus size={14} strokeWidth={2.4} />
            {teamComposerOpen ? 'Close' : 'New team'}
          </button>
        )}

        {!isCompare && (
          <div
            className={`hud-team-composer-wrap${
              teamComposerOpen ? ' hud-team-composer-wrap--open' : ''
            }`}
          >
            <div className="hud-team-composer">
              <input
                ref={inputRef}
                className="hud-team-field"
                value={name}
                maxLength={40}
                placeholder="Team name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitTeam()
                  if (e.key === 'Escape') closeComposer()
                }}
                tabIndex={teamComposerOpen ? 0 : -1}
              />
              <input
                className="hud-team-field"
                value={sizeBucket}
                list="hud-team-size-options"
                placeholder="Team size (e.g. 6-10 engineers)"
                onChange={(e) => setSizeBucket(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitTeam()
                  if (e.key === 'Escape') closeComposer()
                }}
                tabIndex={teamComposerOpen ? 0 : -1}
              />
              <datalist id="hud-team-size-options">
                {sizeBucketOptions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
              <input
                className="hud-team-field"
                value={functionType}
                list="hud-team-function-options"
                placeholder="Function (e.g. Backend/Platform)"
                onChange={(e) => setFunctionType(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitTeam()
                  if (e.key === 'Escape') closeComposer()
                }}
                tabIndex={teamComposerOpen ? 0 : -1}
              />
              <datalist id="hud-team-function-options">
                {functionTypeOptions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
              <button
                className="hud-team-composer-go"
                disabled={!trimmedName}
                onClick={submitTeam}
                tabIndex={teamComposerOpen ? 0 : -1}
              >
                {editingId ? 'Save' : 'Create team'}
              </button>
            </div>
          </div>
        )}
      </div>

      {!isCompare && weekHealth && (
        <div className={`hud-score glass hud-score--${levelFor(weekHealth.score)}`}>
          <div className="hud-ring">
            <svg viewBox="0 0 60 60" width="60" height="60">
              <circle className="hud-ring-track" cx="30" cy="30" r={RING_RADIUS} />
              <circle
                className="hud-ring-value"
                cx="30"
                cy="30"
                r={RING_RADIUS}
                strokeDasharray={RING_LENGTH}
                strokeDashoffset={RING_LENGTH * (1 - weekHealth.score / 100)}
              />
            </svg>
            <span className="hud-score-value">{weekHealth.score}</span>
          </div>
          <div className="hud-score-text">
            <span className="hud-score-title">Team health</span>
            <span className="hud-score-label">Week {weekHealth.week}</span>
          </div>
        </div>
      )}

      {!isCompare && weekHealth && getSignalSource(currentTeam) === 'generated' && (
        <div className="hud-signal hud-signal--muted glass">
          Demo data — no live integration connected yet
        </div>
      )}

      {!isCompare && weekHealth && (
        <SignalPill
          icon={<Ticket size={15} />}
          label={`Jira: ${weekHealth.signals.jira.avgCycleTimeDays}d cycle · ${weekHealth.signals.jira.sprintCompletionPct}% sprint`}
          details={weekHealth.signals.jira.details}
          renderDetails={(d) => <JiraDetailsList details={d} />}
          expanded={expandedSignal === 'jira'}
          onToggle={() => toggleSignal('jira')}
        />
      )}

      {!isCompare && weekHealth && (
        <SignalPill
          icon={<CalendarDays size={15} />}
          label={`Meeting load: ${weekHealth.signals.calendar.avgMeetingHoursPerWeek}h this week`}
          details={weekHealth.signals.calendar.details}
          renderDetails={(d) => <CalendarDetailsList details={d} />}
          expanded={expandedSignal === 'calendar'}
          onToggle={() => toggleSignal('calendar')}
        />
      )}

      {!isCompare && <ConnectCalendar />}

      <button className="hud-compare-toggle glass" onClick={() => setViewMode(isCompare ? 'single' : 'compare')}>
        {isCompare ? <ArrowLeft size={15} /> : <ArrowLeftRight size={15} />}
        {isCompare ? 'Back to village' : 'Compare teams'}
      </button>

      {!isCompare && (
        <div className={`hud-warning-wrap${weekHealth?.earlyWarning ? ' hud-warning-wrap--visible' : ''}`}>
          <div className="hud-warning">
            <TriangleAlert size={16} />
            <span>Early warning: rising cycle time and workload</span>
          </div>
        </div>
      )}
    </div>
  )
}
