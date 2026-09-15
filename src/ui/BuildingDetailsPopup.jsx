import { useEffect, useState } from 'react'
import { BUILDING_TYPES, useVillageStore } from '../store/villageStore'
import { useAppStore } from '../store/appStore'
import { getTeamWeek } from '../logic/teamHealth'
import { getBuildingStatus } from '../logic/buildingStatus'
import './buildingDetailsPopup.css'

const POPUP_MARGIN = 150
const POPUP_MIN_TOP = 190

export default function BuildingDetailsPopup() {
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)
  const selectedId = useVillageStore((s) => s.selectedId)
  const selectedScreenPos = useVillageStore((s) => s.selectedScreenPos)
  const buildings = useVillageStore((s) => s.buildingsByTeam[currentTeam])
  const clearSelection = useVillageStore((s) => s.clearSelection)
  const updateBuildingDetails = useVillageStore((s) => s.updateBuildingDetails)

  const [editMode, setEditMode] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftNotes, setDraftNotes] = useState('')

  const building = selectedId
    ? Object.values(buildings ?? {}).find((b) => b.id === selectedId)
    : null

  // leaving edit mode / closing entirely when the selection itself changes
  useEffect(() => {
    setEditMode(false)
  }, [selectedId])

  if (!building || !selectedScreenPos) return null

  const type = BUILDING_TYPES[building.type]
  if (!type) return null

  const weekHealth = getTeamWeek(currentTeam, currentWeek)
  const status = getBuildingStatus(building.type, weekHealth)
  const displayName = building.name?.trim() || type.label
  const categoryLabel = type.category === 'capability' ? 'Capability Building' : type.label

  const startEdit = () => {
    setDraftName(building.name?.trim() || '')
    setDraftNotes(building.notes ?? '')
    setEditMode(true)
  }

  const handleSave = () => {
    updateBuildingDetails(currentTeam, building.id, {
      name: draftName.trim(),
      notes: draftNotes.trim(),
    })
    setEditMode(false)
  }

  const left = Math.min(
    Math.max(selectedScreenPos.x, POPUP_MARGIN),
    window.innerWidth - POPUP_MARGIN
  )
  const top = Math.max(selectedScreenPos.y - 24, POPUP_MIN_TOP)

  return (
    <div
      className="details-popup"
      style={{ left, top, '--swatch': type.color }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="details-popup-arrow" />
      <div className="details-popup-header">
        <div className="details-popup-titles">
          {editMode ? (
            <input
              className="details-popup-name-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={type.label}
              maxLength={40}
              autoFocus
            />
          ) : (
            <span className="details-popup-name">{displayName}</span>
          )}
          <span className="details-popup-type">{categoryLabel}</span>
        </div>
        <div className="details-popup-actions">
          {!editMode && (
            <button
              className="details-popup-icon-btn"
              onClick={startEdit}
              aria-label="Edit name and notes"
              title="Edit"
            >
              ✏️
            </button>
          )}
          <button
            className="details-popup-icon-btn"
            onClick={clearSelection}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <p className="details-popup-blurb">{type.blurb}</p>

      {status && !editMode && (
        <div className="details-popup-status">
          <span className="details-popup-status-headline">
            {status.headline}
          </span>
          <span className="details-popup-status-detail">{status.detail}</span>
        </div>
      )}

      {editMode ? (
        <div className="details-popup-edit">
          <label className="details-popup-field-label" htmlFor="popup-notes">
            Notes
          </label>
          <textarea
            id="popup-notes"
            className="details-popup-notes-input"
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            placeholder="e.g. Owned by: ..."
            rows={3}
            maxLength={200}
          />
          <div className="details-popup-edit-actions">
            <button
              className="details-popup-btn details-popup-btn--ghost"
              onClick={() => setEditMode(false)}
            >
              Cancel
            </button>
            <button
              className="details-popup-btn details-popup-btn--primary"
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        building.notes?.trim() && (
          <div className="details-popup-notes">
            <span className="details-popup-field-label">Notes</span>
            <p>{building.notes}</p>
          </div>
        )
      )}
    </div>
  )
}
