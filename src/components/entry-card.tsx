'use client'

import { useState } from 'react'
import { OFFICE_MANAGEMENT_CATEGORIES, PROFESSIONAL_CRITERIA, RIBA_STAGES } from '@/lib/pedr/constants'
import { REVIEW_THRESHOLD, type DraftEntry, type Project } from '@/lib/pedr/types'
import { formatDate, formatDuration } from '@/lib/pedr/week'

/**
 * One draft entry, editable.
 *
 * Every route into the record — a typed dump, a pasted Teams export, a
 * timesheet, a synced calendar — ends at this card, so a correction works the
 * same way whatever the source was and there is one place to fix a mistake in
 * how an entry is shown.
 */
export function EntryCard({
  entry,
  projects,
  projectById,
  onChange,
  onRemove,
}: {
  entry: DraftEntry
  projects: Project[]
  projectById: Map<string, Project>
  onChange: (changes: Partial<DraftEntry>) => void
  onRemove: () => void
}) {
  const unsure = entry.confidence < REVIEW_THRESHOLD
  const [open, setOpen] = useState(unsure)

  return (
    <div
      className="sheet sheet-tight stack-s"
      style={unsure ? { borderColor: 'color-mix(in srgb, var(--pending) 45%, transparent)' } : undefined}
    >
      <div className="entry-head">
        <input
          type="date"
          value={entry.date}
          onChange={(e) => onChange({ date: e.target.value })}
          aria-label="Date"
        />
        <input
          type="number"
          min={0}
          max={24}
          step={0.25}
          value={entry.minutes ? +(entry.minutes / 60).toFixed(2) : ''}
          placeholder="hrs"
          onChange={(e) =>
            onChange({
              minutes: Math.round((Number(e.target.value) || 0) * 60),
              minutesEstimated: false,
            })
          }
          aria-label="Hours"
        />
        {entry.minutesEstimated && (
          <span className="mark mark-pending" title="We filled this in; it was not stated">
            <span aria-hidden="true">≈</span> estimated
          </span>
        )}
        {unsure && (
          <span className="mark mark-pending">
            <span aria-hidden="true">?</span> unsure
          </span>
        )}
        <span className="spacer" />
        {/* Grouped so the two actions wrap together on a narrow screen rather
            than leaving "Remove" stranded on a line of its own. */}
        <span className="row" style={{ gap: 4, flex: 'none' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Less' : 'More'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={onRemove}>
            Remove
          </button>
        </span>
      </div>

      <input
        type="text"
        value={entry.activity}
        onChange={(e) => onChange({ activity: e.target.value })}
        aria-label="What you did"
      />

      <div className="row-wrap" style={{ gap: 8 }}>
        <select
          value={entry.projectId ?? ''}
          onChange={(e) => onChange({ projectId: e.target.value || null, projectHint: null })}
          style={{ width: 'auto', minWidth: 170 }}
          aria-label="Project"
        >
          <option value="">
            {entry.projectHint ? `No match — "${entry.projectHint}"` : 'No project'}
          </option>
          {projects.filter((p) => !p.archived).map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `${p.code} · ` : ''}{p.name}
            </option>
          ))}
        </select>

        <select
          value={entry.stage ?? ''}
          onChange={(e) => onChange({ stage: e.target.value === '' ? null : (Number(e.target.value) as never) })}
          style={{ width: 'auto', minWidth: 150 }}
          aria-label="RIBA stage"
        >
          <option value="">No stage</option>
          {RIBA_STAGES.map((s) => (
            <option key={s.id} value={s.id}>{s.code} · {s.short}</option>
          ))}
        </select>

        {!entry.projectId && (
          <select
            value={entry.officeCategory ?? ''}
            onChange={(e) => onChange({ officeCategory: (e.target.value || null) as never })}
            style={{ width: 'auto', minWidth: 150 }}
            aria-label="Office management category"
          >
            <option value="">Not office time</option>
            {OFFICE_MANAGEMENT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {open && (
        <div className="stack-s" style={{ borderTop: '1px solid var(--hair)', paddingTop: 10 }}>
          <div className="field">
            <label>Who you dealt with</label>
            <input
              type="text"
              value={entry.people.join(', ')}
              placeholder="Comma separated"
              onChange={(e) =>
                onChange({ people: e.target.value.split(',').map((p) => p.trim()).filter(Boolean) })
              }
            />
          </div>

          <div className="field">
            <label>What went wrong</label>
            <textarea
              rows={2}
              value={entry.wentWrong ?? ''}
              placeholder="Friction, a mistake, something that surprised you. This is the part that scores."
              onChange={(e) => onChange({ wentWrong: e.target.value || null })}
            />
          </div>

          <div className="field">
            <label>What you learned</label>
            <textarea
              rows={2}
              value={entry.learned ?? ''}
              onChange={(e) => onChange({ learned: e.target.value || null })}
            />
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small dim" style={{ marginBottom: 6 }}>Professional Criteria</legend>
            <div className="row-wrap" style={{ gap: 6 }}>
              {PROFESSIONAL_CRITERIA.map((c) => {
                const on = entry.criteria.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip ${on ? 'chip-ink' : ''}`}
                    style={{ cursor: 'pointer' }}
                    title={c.plainly}
                    aria-pressed={on}
                    onClick={() =>
                      onChange({
                        criteria: on
                          ? entry.criteria.filter((x) => x !== c.id)
                          : [...entry.criteria, c.id].slice(0, 3),
                      })
                    }
                  >
                    {c.id}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {entry.provenance && (
            <p className="tiny faint">From — {entry.provenance}</p>
          )}
          {entry.projectId && projectById.get(entry.projectId)?.isCaseStudy && (
            <p className="tiny" style={{ color: 'var(--ink)' }}>
              This is your case study project. Worth more detail than the rest.
            </p>
          )}
        </div>
      )}

      <p className="tiny faint">
        {formatDate(entry.date, { weekday: true })}
        {entry.minutes > 0 && ` · ${formatDuration(entry.minutes)}`}
      </p>
    </div>
  )
}
