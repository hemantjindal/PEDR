'use client'

import { useState } from 'react'
import { FORMAT_LABELS, type Format } from '@/lib/pedr/formats'

/**
 * Choosing what to take away.
 *
 * A PEDR ends up in three different places and each one wants a different
 * file: RIBA's own form takes pasted text, a PSA wants Word so they can
 * comment, and a Part 3 submission wants PDF. Guessing on somebody's behalf
 * just means they convert it themselves, so the choice is theirs, with the
 * reason for each one written next to it.
 *
 * The appraisal template is here rather than buried because of a real gap: the
 * appraisal is not completed online at all — RIBA hands you a file to fill in —
 * and most people find that out at the point it is due.
 */

interface Document {
  id: string
  name: string
  blurb: string
  formats: Format[]
}

export function DownloadPanel({ periodStart }: { periodStart: string }) {
  const documents: Document[] = [
    {
      id: 'sheet',
      name: 'The record sheet',
      blurb: 'The quarter, in the order of the real form.',
      formats: ['pdf', 'docx', 'md', 'csv'],
    },
    {
      id: 'mentor-appraisal',
      name: 'PSA appraisal template',
      blurb: 'The quarter printed above the boxes your advisor fills in.',
      formats: ['docx', 'pdf'],
    },
    {
      id: 'supervisor-appraisal',
      name: 'Supervisor appraisal template',
      blurb: 'The same, for the architect who supervises you at work.',
      formats: ['docx', 'pdf'],
    },
  ]

  const [document, setDocument] = useState('sheet')
  // Null until somebody chooses: each document has a format it is usually
  // wanted in, and the appraisal's is Word because that is what RIBA hands out
  // and what a mentor has to type into.
  const [format, setFormat] = useState<Format | null>(null)
  const [appendix, setAppendix] = useState(false)

  const active = documents.find((d) => d.id === document) ?? documents[0]
  const available = active.formats
  // Switching document can strip the format that was selected.
  const chosen = format && available.includes(format) ? format : available[0]

  const href =
    `/api/sheets/${periodStart}/export?document=${active.id}&format=${chosen}` +
    (active.id === 'sheet' && chosen !== 'csv' && appendix ? '&appendix=1' : '')

  return (
    <section className="sheet stack no-print">
      <div className="sheet-head">
        <div>
          <span className="label">Take it away</span>
          <h2 style={{ marginTop: 3 }}>Download</h2>
        </div>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 8 }}>Which document</legend>
        <div className="stack-s">
          {documents.map((doc) => (
            <label key={doc.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input
                type="radio"
                name="document"
                value={doc.id}
                checked={document === doc.id}
                onChange={() => { setDocument(doc.id); setFormat(null) }}
                style={{ width: 'auto', marginTop: 3 }}
              />
              <span>
                <span className="small" style={{ fontWeight: 600 }}>{doc.name}</span>
                <br />
                <span className="tiny faint">{doc.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 8 }}>Which format</legend>
        <div className="row-wrap" style={{ gap: 5 }}>
          {available.map((f) => (
            <button
              key={f}
              type="button"
              className={`chip ${chosen === f ? 'chip-ink' : ''}`}
              style={{ cursor: 'pointer' }}
              aria-pressed={chosen === f}
              onClick={() => setFormat(f)}
            >
              {FORMAT_LABELS[f].name}
            </button>
          ))}
        </div>
        <p className="tiny faint" style={{ marginTop: 8 }}>{FORMAT_LABELS[chosen].note}</p>
      </fieldset>

      {active.id === 'sheet' && chosen !== 'csv' && (
        <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={appendix}
            onChange={(e) => setAppendix(e.target.checked)}
            style={{ width: 'auto', marginTop: 3 }}
          />
          <span>
            Append every entry behind it.
            <br />
            <span className="tiny faint">
              Not part of the submission — it is so a mentor can check any line back to the day it
              was logged. It will make the file much longer.
            </span>
          </span>
        </label>
      )}

      <a className="btn btn-primary" href={href} download>
        Download the {FORMAT_LABELS[chosen].noun}
      </a>
    </section>
  )
}
