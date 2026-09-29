import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Sprout, MousePointerClick, Sparkles, Hand } from 'lucide-react'
import { ARCHETYPES, ARCHETYPE_IDS, GENERIC_SUGGESTIONS, guessArchetype } from '../data/archetypes'
import { COMMONS_ID, countArchetypes, useVillageStore } from '../store/villageStore'
import { useAppStore } from '../store/appStore'
import { useTeamsStore } from '../store/teamsStore'
import { useSignalsStore } from '../store/signalsStore'
import { getTeamWeek } from '../logic/teamHealth'
import { getCapabilityStatus, getCommonsStatus } from '../logic/buildingStatus'
import ArchetypeGlyph from './ArchetypeGlyph'
import './panel.css'

const MAX_CHIPS = 6

export default function Panel() {
  const currentTeam = useAppStore((s) => s.currentTeam)
  const currentWeek = useAppStore((s) => s.currentWeek)
  const buildings = useVillageStore((s) => s.buildingsByTeam[currentTeam])
  // Subscribed purely so this re-renders once signals finish loading async.
  useSignalsStore((s) => s.weeklyByTeam[currentTeam])
  const placing = useVillageStore((s) => s.placing)
  const selectedId = useVillageStore((s) => s.selectedId)
  const startPlacing = useVillageStore((s) => s.startPlacing)
  const cancelPlacing = useVillageStore((s) => s.cancelPlacing)
  const addCapability = useVillageStore((s) => s.addCapability)
  const removeBuilding = useVillageStore((s) => s.removeBuilding)
  const selectBuilding = useVillageStore((s) => s.selectBuilding)
  const setHighlightedId = useVillageStore((s) => s.setHighlightedId)

  const [composerOpen, setComposerOpen] = useState(false)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState(null) // null = follow the auto suggestion
  const [confirmId, setConfirmId] = useState(null)
  const inputRef = useRef(null)

  const team = useTeamsStore((s) => s.teams[currentTeam])
  const weekHealth = getTeamWeek(currentTeam, currentWeek)
  const capStatus = getCapabilityStatus(weekHealth)
  const commonsStatus = getCommonsStatus(weekHealth)

  const list = useMemo(
    () =>
      Object.values(buildings ?? {}).sort(
        (a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))
      ),
    [buildings]
  )
  const used = useMemo(() => countArchetypes(buildings), [buildings])

  const trimmed = name.trim()
  const suggested = guessArchetype(trimmed, used)
  const archetype = picked ?? suggested

  // suggestion chips: this team's own vocabulary first, then generic ones,
  // minus anything already on the island
  const chips = useMemo(() => {
    const have = new Set(list.map((b) => b.name.trim().toLowerCase()))
    const pool = [...(team?.capabilities ?? []), ...GENERIC_SUGGESTIONS]
    const seen = new Set()
    return pool
      .filter((n) => {
        const key = n.toLowerCase()
        if (have.has(key) || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, MAX_CHIPS)
  }, [list, team])

  useEffect(() => {
    if (composerOpen) inputRef.current?.focus()
  }, [composerOpen])

  // drop the two-step delete confirmation if the user wanders off
  useEffect(() => {
    if (!confirmId) return undefined
    const timer = setTimeout(() => setConfirmId(null), 2600)
    return () => clearTimeout(timer)
  }, [confirmId])

  const closeComposer = () => {
    setComposerOpen(false)
    setName('')
    setPicked(null)
  }

  const toggleComposer = () => {
    if (composerOpen) {
      closeComposer()
    } else {
      cancelPlacing()
      setComposerOpen(true)
    }
  }

  const submit = () => {
    if (!trimmed) return
    startPlacing({ name: trimmed, archetype })
    closeComposer()
  }

  const addChip = (chip) => addCapability(currentTeam, { name: chip })

  const addAll = () => {
    chips.forEach((chip, i) => setTimeout(() => addCapability(currentTeam, { name: chip }), i * 140))
  }

  const handleRemove = (id) => {
    if (confirmId === id) {
      removeBuilding(currentTeam, id)
      setConfirmId(null)
    } else {
      setConfirmId(id)
    }
  }

  return (
    <aside className="panel glass">
      <header className="panel-brand">
        <span className="panel-logo">
          <Sprout size={18} strokeWidth={2.2} />
        </span>
        <div className="panel-brand-text">
          <span className="panel-brand-name">Growth</span>
          <span className="panel-brand-team">{team?.name}</span>
        </div>
      </header>

      <div className="panel-section-head">
        <span className="panel-section-title">
          Capabilities
          <span className="panel-count">{list.length}</span>
        </span>
        <button
          className={`panel-add${composerOpen ? ' panel-add--open' : ''}`}
          onClick={toggleComposer}
          aria-expanded={composerOpen}
          aria-label={composerOpen ? 'Close new capability' : 'Add a capability'}
        >
          <Plus size={15} strokeWidth={2.4} />
          <span>{composerOpen ? 'Close' : 'Add'}</span>
        </button>
      </div>

      <div className={`panel-composer-wrap${composerOpen ? ' panel-composer-wrap--open' : ''}`}>
        <div className="panel-composer" style={{ '--accent-shape': ARCHETYPES[archetype].color }}>
          <div className="composer-input-row">
            <span className="composer-glyph">
              <ArchetypeGlyph id={archetype} size={18} />
            </span>
            <input
              ref={inputRef}
              className="composer-input"
              value={name}
              maxLength={32}
              placeholder="Name it: Payments, Paid Media, Support..."
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') closeComposer()
              }}
              tabIndex={composerOpen ? 0 : -1}
            />
          </div>

          <div className="composer-shapes" role="radiogroup" aria-label="Building shape">
            {ARCHETYPE_IDS.map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={archetype === id}
                aria-label={ARCHETYPES[id].label}
                title={ARCHETYPES[id].label}
                tabIndex={composerOpen ? 0 : -1}
                className={`composer-shape${archetype === id ? ' composer-shape--on' : ''}`}
                style={{ '--shape': ARCHETYPES[id].color }}
                onClick={() => setPicked(picked === id && id === suggested ? null : id)}
              >
                <ArchetypeGlyph id={id} size={18} />
              </button>
            ))}
          </div>
          <p className="composer-shape-caption">
            <strong>{ARCHETYPES[archetype].label}</strong>
            <span>
              {picked ? ARCHETYPES[archetype].blurb : trimmed ? 'Picked for you' : ARCHETYPES[archetype].blurb}
            </span>
          </p>

          <button className="composer-go" disabled={!trimmed} onClick={submit} tabIndex={composerOpen ? 0 : -1}>
            <MousePointerClick size={16} strokeWidth={2.2} />
            Place on island
          </button>
        </div>
      </div>

      <div className="panel-list">
        {list.length === 0 && (
          <div className="panel-empty">
            <span className="panel-empty-icon">
              <Sparkles size={20} />
            </span>
            <strong>Name what your team does</strong>
            <span>Each capability becomes a building on your island.</span>
          </div>
        )}

        {list.map((b) => {
          const info = ARCHETYPES[b.archetype] ?? ARCHETYPES.lighthouse
          const confirming = confirmId === b.id
          return (
            <div
              key={b.id}
              className={`panel-row${selectedId === b.id ? ' panel-row--selected' : ''}`}
              style={{ '--shape': info.color }}
              onMouseEnter={() => setHighlightedId(b.id)}
              onMouseLeave={() => setHighlightedId(null)}
            >
              <button className="panel-row-main" onClick={() => selectBuilding(b.id)}>
                <span className="panel-row-badge">
                  <ArchetypeGlyph id={b.archetype} size={18} />
                </span>
                <span className="panel-row-text">
                  <span className="panel-row-name">{b.name}</span>
                  <span className="panel-row-kind">{info.label}</span>
                </span>
                {capStatus && (
                  <span
                    className={`panel-dot panel-dot--${capStatus.level}`}
                    title={capStatus.headline}
                  />
                )}
              </button>
              <button
                className={`panel-row-remove${confirming ? ' panel-row-remove--confirm' : ''}`}
                onClick={() => handleRemove(b.id)}
                aria-label={confirming ? `Confirm removing ${b.name}` : `Remove ${b.name}`}
                title={confirming ? 'Click again to remove' : 'Remove'}
              >
                <Trash2 size={14} />
                {confirming && <span>Remove?</span>}
              </button>
            </div>
          )
        })}

        {chips.length > 0 && (
          <div className="panel-suggest">
            <div className="panel-suggest-head">
              <span>{list.length === 0 ? 'Start with' : 'Suggested'}</span>
              {chips.length > 1 && (
                <button className="panel-suggest-all" onClick={addAll}>
                  Add all {chips.length}
                </button>
              )}
            </div>
            <div className="panel-chips">
              {chips.map((chip) => (
                <button key={chip} className="panel-chip" onClick={() => addChip(chip)}>
                  <Plus size={12} strokeWidth={2.6} />
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel-shared">
        <span className="panel-section-title">Shared</span>
        <div
          className={`panel-row panel-row--commons${selectedId === COMMONS_ID ? ' panel-row--selected' : ''}`}
          style={{ '--shape': '#4bae5c' }}
          onMouseEnter={() => setHighlightedId(COMMONS_ID)}
          onMouseLeave={() => setHighlightedId(null)}
        >
          <button className="panel-row-main" onClick={() => selectBuilding(COMMONS_ID)}>
            <span className="panel-row-badge">
              <Sprout size={18} strokeWidth={1.9} />
            </span>
            <span className="panel-row-text">
              <span className="panel-row-name">Knowledge Commons</span>
              <span className="panel-row-kind">Paths connect every capability to it</span>
            </span>
            {commonsStatus && (
              <span className={`panel-dot panel-dot--${commonsStatus.level}`} title={commonsStatus.headline} />
            )}
          </button>
        </div>
      </div>

      <footer className="panel-hint">
        {placing ? (
          <>
            <MousePointerClick size={14} />
            <span>
              Click a glowing spot to place <strong>{placing.name}</strong> &middot; Esc to cancel
            </span>
          </>
        ) : (
          <>
            <Hand size={14} />
            <span>Drag buildings to rearrange &middot; click for details</span>
          </>
        )}
      </footer>
    </aside>
  )
}
