'use client'

import { useState } from 'react'
import { deleteEntryAction, saveEntryAction } from '@/app/(app)/actions'
import {
  OFFICE_MANAGEMENT_CATEGORIES, PROFESSIONAL_CRITERIA, RIBA_STAGES, officeCategory, stage as stageInfo,
} from '@/lib/pedr/constants'
import type { Entry, Project } from '@/lib/pedr/types'
import { REVIEW_THRESHOLD } from '@/lib/pedr/types'
import { formatDate, formatDuration } from '@/lib/pedr/week'

/**
 * One entry, readable at a glance and editable in place.
 *
 * Everything the parser inferred is visible and changeable, including the
 * sentence of input it came from — if we say this was Stage 5, you can see the
 * words that made us think so.
 */
export function EntryRow({
  entry,
  projects,
  showDate = false,
}: {
  entry: Entry
  projects: Project[]
  showDate?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const project = projects.find((p) => p.id === entry.projectId)
  const office = entry.officeCategory ? officeCategory(entry.officeCategory) : null
  const unsure = entry.confidence < REVIEW_THRESHOLD

  if (editing) {
    return (
      <form action={saveEntryAction} className="card card-tight stack-s">
        <input type="hidden" name="entryId" value={entry.id} />
        <div className="row-wrap" style={{ gap: 8 }}>
          <input type="date" name="date" defaultValue={entry.date} style={{ width: 150 }} aria-label="Date" />
          <input
            type="number" name="hours" min={0} max={24} step={0.25}
            defaultValue={entry.minutes ? +(entry.minutes / 60).toFixed(2) : ''}
            placeholder="hrs" style={{ width: 82 }} aria-label="Hours"
          />
          <select name="projectId" defaultValue={entry.projectId ?? ''} style={{ width: 'auto', minWidth: 170 }} aria-label="Project">
            <option value="">No project</option>
            {projects.filter((p) => !p.archived || p.id === entry.projectId).map((p) => (
              <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ''}{p.name}</option>
            ))}
          </select>
          <select name="stage" defaultValue={entry.stage ?? ''} style={{ width: 'auto', minWidth: 150 }} aria-label="RIBA stage">
            <option value="">No stage</option>
            {RIBA_STAGES.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.short}</option>)}
          </select>
          <select name="officeCategory" defaultValue={entry.officeCategory ?? ''} style={{ width: 'auto', minWidth: 150 }} aria-label="Office category">
            <option value="">Not office time</option>
            {OFFICE_MANAGEMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <input type="text" name="activity" defaultValue={entry.activity} aria-label="What you did" />
        <textarea name="detail" rows={2} defaultValue={entry.detail ?? ''} placeholder="Any more detail" />

        <div className="field">
          <label>Who you dealt with</label>
          <input type="text" name="people" defaultValue={entry.people.join(', ')} placeholder="Comma separated" />
        </div>

        <div className="field">
          <label>What went wrong</label>
          <textarea name="wentWrong" rows={2} defaultValue={entry.wentWrong ?? ''} />
        </div>

        <div className="field">
          <label>What you learned</label>
          <textarea name="learned" rows={2} defaultValue={entry.learned ?? ''} />
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small dim" style={{ marginBottom: 6 }}>Professional Criteria</legend>
          <div className="row-wrap" style={{ gap: 12 }}>
            {PROFESSIONAL_CRITERIA.map((c) => (
              <label key={c.id} className="row small" style={{ gap: 5 }} title={c.plainly}>
                <input
                  type="checkbox" name="criteria" value={c.id}
                  defaultChecked={entry.criteria.includes(c.id)}
                  style={{ width: 'auto' }}
                />
                {c.id}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="row-wrap">
          <button type="submit" className="btn btn-primary btn-sm">Save</button>
          <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          <span className="spacer" />
          <button type="submit" formAction={deleteEntryAction} className="btn btn-ghost btn-sm btn-danger">
            Delete
          </button>
        </div>
      </form>
    )
  }

  return (
    <div
      className="card card-tight stack-s"
      style={unsure ? { borderColor: 'color-mix(in srgb, var(--warning) 45%, transparent)' } : undefined}
    >
      <div className="row-wrap" style={{ gap: 8 }}>
        {showDate && <span className="small tabular muted">{formatDate(entry.date, { weekday: true, year: false })}</span>}
        {project && <span className="badge badge-accent">{project.code || project.name}</span>}
        {!project && entry.projectHint && (
          <span className="badge badge-warning" title="Not matched to a project on your list">
            <span aria-hidden="true">?</span> {entry.projectHint}
          </span>
        )}
        {office && <span className="badge">{office.name}</span>}
        {entry.stage !== null && (
          <span className="badge" title={stageInfo(entry.stage)?.blurb}>
            Stage {entry.stage} · {stageInfo(entry.stage)?.short}
          </span>
        )}
        {entry.criteria.map((c) => <span className="badge" key={c}>{c}</span>)}
        <span className="spacer" />
        {entry.minutes > 0 && (
          <span className="small tabular muted">
            {formatDuration(entry.minutes)}
            {entry.minutesEstimated && <span title="Estimated, not stated"> ≈</span>}
          </span>
        )}
        <button type="button" className="btn btn-ghost btn-sm no-print" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>

      <p style={{ fontWeight: 500 }}>{entry.activity}</p>
      {entry.detail && <p className="small dim">{entry.detail}</p>}

      {entry.people.length > 0 && (
        <p className="tiny muted">With {entry.people.join(', ')}</p>
      )}
      {entry.wentWrong && (
        <p className="small" style={{ color: 'var(--serious-ink)' }}>
          <span aria-hidden="true">⚠ </span>{entry.wentWrong}
        </p>
      )}
      {entry.learned && (
        <p className="small" style={{ color: 'var(--good-ink)' }}>
          <span aria-hidden="true">✦ </span>{entry.learned}
        </p>
      )}
      {unsure && (
        <p className="tiny muted">
          Read this one — we were not sure.{entry.provenance ? ` From: ${entry.provenance}` : ''}
        </p>
      )}
    </div>
  )
}
