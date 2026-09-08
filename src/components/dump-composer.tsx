'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  OFFICE_MANAGEMENT_CATEGORIES, PROFESSIONAL_CRITERIA, RIBA_STAGES,
} from '@/lib/pedr/constants'
import { REVIEW_THRESHOLD, type DraftEntry, type DumpKind, type Project } from '@/lib/pedr/types'
import { formatDate, formatDuration } from '@/lib/pedr/week'

/**
 * The dump surface.
 *
 * The whole product depends on this being frictionless enough to use on a
 * Friday afternoon on a phone. So: one box, no required fields, no structure
 * demanded up front. Parse, show what we made of it, let it be corrected, save.
 *
 * Nothing reaches the record without passing through the review step, because
 * a record a mentor signs should never contain something nobody looked at.
 */

interface PreviewResponse {
  kind: DumpKind
  entries: DraftEntry[]
  warnings: string[]
  enriched: boolean
  stats: { confident: number; needsReview: number; days: number; totalMinutes: number }
  parserVersion: string
  modelAvailable: boolean
  reference: string
}

const EXAMPLE = `w/c 7 Sep
mon - battersea, worked up the stair details with Tom. 4h. sent the wrong revision first, had to reissue
tue: all day on 1042 tender package
wed - site visit nine elms with Sarah Chen from Mace
thurs - cpd lunchtime talk on the building safety act
fri half day, planning submission for BSQ`

export function DumpComposer({
  projects,
  today,
  modelAvailable,
}: {
  projects: Project[]
  today: string
  modelAvailable: boolean
}) {
  const router = useRouter()
  const [raw, setRaw] = useState('')
  const [reference, setReference] = useState(today)
  const [fillDurations, setFillDurations] = useState(false)
  const [useModel, setUseModel] = useState(modelAvailable)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [entries, setEntries] = useState<DraftEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ count: number } | null>(null)

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  )

  const totals = useMemo(() => {
    const days = new Set(entries.map((e) => e.date)).size
    const minutes = entries.reduce((sum, e) => sum + e.minutes, 0)
    return { days, minutes }
  }, [entries])

  async function runPreview() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/dumps/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw, reference, fillMissingDurations: fillDurations, useModel }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not read that.')
      setPreview(data)
      setEntries(data.entries)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that.')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/dumps', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          raw,
          kind: preview.kind,
          enriched: preview.enriched,
          entries,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not save that.')
      setSaved({ count: data.saved })
      setPreview(null)
      setEntries([])
      setRaw('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  function patch(index: number, changes: Partial<DraftEntry>) {
    setEntries((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)),
    )
  }

  function remove(index: number) {
    setEntries((current) => current.filter((_, i) => i !== index))
  }

  // ---- Saved -------------------------------------------------------------

  if (saved) {
    return (
      <div className="sheet stack">
        <h2>Saved — {saved.count} {saved.count === 1 ? 'entry' : 'entries'} on the record.</h2>
        <p className="dim small">
          That is the hard part done. The weeks, coverage and sheets all update from it.
        </p>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary" onClick={() => setSaved(null)}>
            Dump something else
          </button>
          <a className="btn" href="/dashboard">See the dashboard</a>
        </div>
      </div>
    )
  }

  // ---- Review ------------------------------------------------------------

  if (preview) {
    return (
      <div className="stack">
        <div className="sheet stack-s">
          <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
            <h2>Check this before it goes on the record</h2>
            <span className="chip">{labelForKind(preview.kind)}</span>
          </div>
          <p className="dim small">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} across {totals.days}{' '}
            {totals.days === 1 ? 'day' : 'days'} · {formatDuration(totals.minutes)} total.
            {preview.stats.needsReview > 0 && (
              <> {preview.stats.needsReview} marked unsure — those are the ones worth reading.</>
            )}
          </p>
          {preview.warnings.map((warning) => (
            <p className="note note-pending small" key={warning}>
              <span aria-hidden="true">⚠</span> {warning}
            </p>
          ))}
        </div>

        <div className="stack-s">
          {entries.map((entry, index) => (
            <EntryCard
              key={`${entry.date}-${index}`}
              entry={entry}
              projects={projects}
              projectById={projectById}
              onChange={(changes) => patch(index, changes)}
              onRemove={() => remove(index)}
            />
          ))}
          {entries.length === 0 && (
            <p className="note small">Nothing left to save. Go back and try again.</p>
          )}
        </div>

        {error && <p className="note note-revision small" role="alert"><span aria-hidden="true">⚠</span> {error}</p>}

        <div className="row-wrap" style={{ position: 'sticky', bottom: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={busy || entries.length === 0}
          >
            {busy ? 'Saving…' : `Save ${entries.length} to the record`}
          </button>
          <button type="button" className="btn" onClick={() => setPreview(null)} disabled={busy}>
            Back to the text
          </button>
        </div>
      </div>
    )
  }

  // ---- Compose -----------------------------------------------------------

  return (
    <div className="stack">
      <div className="sheet stack">
        <div className="field">
          <label htmlFor="raw">What happened?</label>
          <textarea
            id="raw"
            rows={12}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={EXAMPLE}
            spellCheck
            autoCapitalize="sentences"
            style={{ fontSize: '16px' /* stops iOS zooming on focus */ }}
          />
          <span className="hint">
            Type it badly. Days, half-sentences, no punctuation — all fine. You can also paste a
            Teams conversation or a timesheet export and it will work out which it is.
          </span>
        </div>

        <details>
          <summary className="small dim" style={{ cursor: 'pointer' }}>Options</summary>
          <div className="stack-s" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="reference">Written on</label>
              <input
                id="reference"
                type="date"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <span className="hint">
                Days like &ldquo;Mon&rdquo; and &ldquo;yesterday&rdquo; are worked out from this date.
              </span>
            </div>

            <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={fillDurations}
                onChange={(e) => setFillDurations(e.target.checked)}
                style={{ width: 'auto', marginTop: 3 }}
              />
              <span>
                Fill in missing hours by spreading a standard day.
                <br />
                <span className="tiny faint">
                  Off by default. Anything filled in this way is marked as an estimate, because your
                  mentor signs these.
                </span>
              </span>
            </label>

            <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={useModel && modelAvailable}
                disabled={!modelAvailable}
                onChange={(e) => setUseModel(e.target.checked)}
                style={{ width: 'auto', marginTop: 3 }}
              />
              <span>
                Use the model to tidy it up.
                <br />
                <span className="tiny faint">
                  {modelAvailable
                    ? 'Improves wording and tagging on messy text. It can never set your hours.'
                    : 'Not configured — set ANTHROPIC_API_KEY to enable. Everything works without it.'}
                </span>
              </span>
            </label>
          </div>
        </details>

        {error && <p className="note note-revision small" role="alert"><span aria-hidden="true">⚠</span> {error}</p>}

        <div className="row-wrap">
          <button
            type="button"
            className="btn btn-primary"
            onClick={runPreview}
            disabled={busy || raw.trim().length === 0}
          >
            {busy ? 'Reading…' : 'Read it'}
          </button>
          {raw.trim().length === 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRaw(EXAMPLE)}>
              Try the example
            </button>
          )}
        </div>
      </div>

    </div>
  )
}

function labelForKind(kind: DumpKind): string {
  return kind === 'teams' ? 'Read as a Teams chat'
    : kind === 'timesheet' ? 'Read as a timesheet'
    : kind === 'email' ? 'Read as an email'
    : 'Read as notes'
}

// ---------------------------------------------------------------------------

function EntryCard({
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
