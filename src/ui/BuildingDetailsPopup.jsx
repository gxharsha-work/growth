import { useEffect, useState } from 'react'
import { Pencil, X, Trash2, Sprout, Check } from 'lucide-react'
import { ARCHETYPES, ARCHETYPE_IDS } from '../data/archetypes'
import { COMMONS_ID, useVillageStore } from '../store/villageStore'
import { useAppStore } from '../store/appStore'
import { useSignalsStore } from '../store/signalsStore'
import { getTeamWeek } from '../logic/teamHealth'
import { getCapabilityStatus, getCommonsStatus } from '../logic/buildingStatus'
import ArchetypeGlyph from './ArchetypeGlyph'
import './buildingDetailsPopup.css'

const POPUP_MARGIN = 160
const POPUP_MIN_TOP = 210

export default function BuildingDetailsPopup() {
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)
  const selectedId = useVillageStore((s) => s.selectedId)
  const selectedScreenPos = useVillageStore((s) => s.selectedScreenPos)
  const buildings = useVillageStore((s) => s.buildingsByTeam[currentTeam])
  const clearSelection = useVillageStore((s) => s.clearSelection)
  const updateBuildingDetails = useVillageStore((s) => s.updateBuildingDetails)
  const removeBuilding = useVillageStore((s) => s.removeBuilding)
  // Subscribed purely so this re-renders once signals finish loading async.
  useSignalsStore((s) => s.weeklyByTeam[currentTeam])

  const [editMode, setEditMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftShape, setDraftShape] = useState('lighthouse')

  const isCommons = selectedId === COMMONS_ID
  const building =
    selectedId && !isCommons
      ? Object.values(buildings ?? {}).find((b) => b.id === selectedId)
      : null

  useEffect(() => {
    setEditMode(false)
    setConfirmDelete(false)
  }, [selectedId])

  if ((!building && !isCommons) || !selectedScreenPos) return null

  const weekHealth = getTeamWeek(currentTeam, currentWeek)
  const status = isCommons ? getCommonsStatus(weekHealth) : getCapabilityStatus(weekHealth)
  const info = building ? (ARCHETYPES[building.archetype] ?? ARCHETYPES.lighthouse) : null
  const accent = isCommons ? '#4bae5c' : info.color
  const title = isCommons ? 'Knowledge Commons' : building.name
  const subtitle = isCommons ? 'Shared by the whole team' : info.label

  const startEdit = () => {
    setDraftName(building.name)
    setDraftNotes(building.notes ?? '')
    setDraftShape(building.archetype)
    setEditMode(true)
  }

  const handleSave = () => {
    const name = draftName.trim()
    if (!name) return
    updateBuildingDetails(currentTeam, building.id, {
      name,
      notes: draftNotes.trim(),
      archetype: draftShape,
    })
    setEditMode(false)
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    removeBuilding(currentTeam, building.id)
  }

  const left = Math.min(Math.max(selectedScreenPos.x, POPUP_MARGIN), window.innerWidth - POPUP_MARGIN)
  const top = Math.max(selectedScreenPos.y - 16, POPUP_MIN_TOP)
  const editAccent = editMode ? ARCHETYPES[draftShape].color : accent

  return (
    <div
      className="details-popup glass"
      style={{ left, top, '--shape': editAccent }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="details-popup-arrow" />

      <div className="details-popup-header">
        <span className="details-popup-badge">
          {isCommons ? (
            <Sprout size={20} strokeWidth={1.9} />
          ) : (
            <ArchetypeGlyph id={editMode ? draftShape : building.archetype} size={21} />
          )}
        </span>
        <div className="details-popup-titles">
          {editMode ? (
            <input
              className="details-popup-name-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Capability name"
              maxLength={32}
              autoFocus
            />
          ) : (
            <span className="details-popup-name">{title}</span>
          )}
          <span className="details-popup-type">{subtitle}</span>
        </div>
        <div className="details-popup-actions">
          {!editMode && !isCommons && (
            <button className="details-popup-icon-btn" onClick={startEdit} aria-label="Edit" title="Edit">
              <Pencil size={15} />
            </button>
          )}
          <button className="details-popup-icon-btn" onClick={clearSelection} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {status && !editMode && (
        <div className={`details-popup-status details-popup-status--${status.level}`}>
          <div className="details-popup-meter">
            <span style={{ width: `${status.score}%` }} />
          </div>
          <span className="details-popup-status-headline">{status.headline}</span>
          <span className="details-popup-status-detail">{status.detail}</span>
        </div>
      )}

      {isCommons && (
        <p className="details-popup-blurb">
          The shared heart of the island. Every capability connects to it, and it thrives when
          code reviews come back fast.
        </p>
      )}

      {editMode ? (
        <div className="details-popup-edit">
          <span className="details-popup-field-label">Shape</span>
          <div className="details-popup-shapes">
            {ARCHETYPE_IDS.map((id) => (
              <button
                key={id}
                title={ARCHETYPES[id].label}
                aria-label={ARCHETYPES[id].label}
                className={`details-popup-shape${draftShape === id ? ' details-popup-shape--on' : ''}`}
                style={{ '--tile': ARCHETYPES[id].color }}
                onClick={() => setDraftShape(id)}
              >
                <ArchetypeGlyph id={id} size={17} />
              </button>
            ))}
          </div>
          <label className="details-popup-field-label" htmlFor="popup-notes">
            Notes
          </label>
          <textarea
            id="popup-notes"
            className="details-popup-notes-input"
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            placeholder="Owner, scope, anything worth remembering"
            rows={3}
            maxLength={200}
          />
          <div className="details-popup-edit-actions">
            <button
              className={`details-popup-btn details-popup-btn--danger${confirmDelete ? ' is-confirm' : ''}`}
              onClick={handleDelete}
            >
              <Trash2 size={14} />
              {confirmDelete ? 'Confirm' : 'Remove'}
            </button>
            <span className="details-popup-spacer" />
            <button className="details-popup-btn details-popup-btn--ghost" onClick={() => setEditMode(false)}>
              Cancel
            </button>
            <button
              className="details-popup-btn details-popup-btn--primary"
              onClick={handleSave}
              disabled={!draftName.trim()}
            >
              <Check size={14} strokeWidth={2.6} />
              Save
            </button>
          </div>
        </div>
      ) : (
        building?.notes?.trim() && (
          <div className="details-popup-notes">
            <span className="details-popup-field-label">Notes</span>
            <p>{building.notes}</p>
          </div>
        )
      )}
    </div>
  )
}
