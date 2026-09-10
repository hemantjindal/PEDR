'use client'

import { useEffect, useMemo, useState } from 'react'
import { RecoveryGrid } from './recovery-grid'
import { recoveryWindow, triage, type RecoveryReport } from '@/lib/pedr/recover'
import { SHEET_RULES } from '@/lib/pedr/constants'
import { formatDate, isDateKey, weekIdOf, weekRange, type WeekId } from '@/lib/pedr/week'
import { stashPending } from '@/lib/pending-import'

/**
 * The tool the site opens on.
 *
 * One question, then a register of week-squares drawn hollow, then a file. How
 * much is logged, how many weeks are holes and how many months can be claimed
 * all come out of the file rather than out of an estimate somebody types.
 *
 * What it finds is carried into the account they make next, so the first thing
 * a new record contains is eighteen months of work they had already done.
 */

type Phase =
  | { at: 'idle' }
  | { at: 'working' }
  | { at: 'error'; message: string }
  | { at: 'done'; report: RecoveryReport; label: string }

const MAX_BYTES = 8_000_000

export function CatchUpTool({ onKeep = 'account' }: { onKeep?: 'account' | 'export' } = {}) {
  const [start, setStart] = useState('')
  const [phase, setPhase] = useState<Phase>({ at: 'idle' })
  const [canSave, setCanSave] = useState(true)

  useEffect(() => {
    const mediated = host()
    if (!mediated) return
    // A host that mediates downloads may also refuse them; ask once.
    void mediated.use('downloads').then((d) => setCanSave(Boolean(d)))
  }, [])

  const range = useMemo(() => (isDateKey(start) ? recoveryWindow(start) : null), [start])

  const verdict = useMemo(() => {
    if (!range) return null
    // Once a calendar has been read, the week count is measured rather than
    // guessed — which is the whole reason this asks one question instead of three.
    const weeksLogged = phase.at === 'done' ? phase.report.recovered : 0
    return triage({ experienceStart: start, sheetsDone: 0, weeksLogged })
  }, [range, start, phase])

  const recovered = useMemo(() => {
    if (phase.at !== 'done') return undefined
    const map = new Map<WeekId, number>()
    for (const entry of phase.report.entries) {
      const id = weekIdOf(entry.date)
      map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [phase])

  async function read(file: File | undefined) {
    if (!file || !range) return
    if (file.size > MAX_BYTES) {
      setPhase({ at: 'error', message: 'Too big. Export a year at a time.' })
      return
    }
    const text = await file.text()
    setPhase({ at: 'working' })
    try {
      // Loaded on demand: most people who open this page never get here, and
      // they should not pay for the parsers on the way past.
      const [ingest, recovery] = await Promise.all([
        import('@/lib/ingest'),
        import('@/lib/pedr/recover'),
      ])
      const isIcs = /BEGIN:VCALENDAR/i.test(text.slice(0, 4000))
      const entries = isIcs
        ? ingest.calendarToEntries(ingest.parseCalendar(text, range))
        : ingest.parseDump(text, { reference: range.to }).entries.filter(
            (e) => e.date >= range.from && e.date <= range.to,
          )

      if (entries.length === 0) {
        setPhase({
          at: 'error',
          message: 'Nothing in that file falls inside your dates. Most exports default to a month.',
        })
        return
      }
      const report = recovery.recover({
        ...range,
        sources: [{ source: isIcs ? 'calendar' : 'timesheet', label: file.name, entries }],
      })
      setPhase({ at: 'done', report, label: file.name })
    } catch {
      setPhase({ at: 'error', message: 'Could not read that. An .ics export is what this wants.' })
    }
  }

  const done = phase.at === 'done' ? phase.report : null
  const total = range ? weekRange(range.from, range.to).length : 0
  const step = !range ? 1 : !done ? 2 : 3

  return (
    <div className="tool">
      {step === 1 && (
        <div className="step">
          <h1>Behind on your PEDR?</h1>
          <p className="lede">
            So is nearly everyone. Most of what you need is already written down — let&rsquo;s go
            and find it.
          </p>
          <div className="ask">
            <div className="field">
              <label htmlFor="start">When did you start in practice?</label>
              <input
                id="start"
                type="date"
                value={start}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => { setStart(e.target.value); setPhase({ at: 'idle' }) }}
              />
            </div>
            <p className="hint">A rough date is fine. You can change it later.</p>
          </div>
        </div>
      )}

      {step === 2 && range && (
        <div className="step">
          <h1>{total} weeks since you started.</h1>
          <p className="lede">
            Your calendar remembers nearly all of them. Bring it here and watch them come back.
          </p>

          <RecoveryGrid {...range} />

          <label className="drop">
            <input
              type="file"
              accept=".ics,text/calendar,.csv,.tsv,text/csv,text/plain"
              hidden
              onChange={(e) => { void read(e.target.files?.[0]); e.target.value = '' }}
            />
            <span className="drop-main">
              {phase.at === 'working' ? 'Reading your calendar…' : 'Choose your calendar file'}
            </span>
            <span className="drop-hint">
              Outlook: File → Save Calendar. Google Calendar: Settings → Export.
            </span>
          </label>

          {phase.at === 'error' && <p className="soft-error">{phase.message}</p>}

          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStart('')}>
            ← Change the date
          </button>
        </div>
      )}

      {step === 3 && range && done && (
        <div className="step">
          <div className="moment">
            <span className="figure">{done.monthsRecovered}</span>
            <span className="moment-unit">months you already have</span>
            <div className="moment-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (done.monthsRecovered / 24) * 100)}%` }} />
            </div>
            <span className="moment-note">
              {done.recovered} of your {total} weeks, out of work you had already done
            </span>
          </div>

          <RecoveryGrid {...range} recovered={recovered} />

          <div className="next">
            {done.blank.length > 0 && (
              <p>
                <span className="dot" aria-hidden="true" />
                <span>
                  <strong>{done.blank.length} weeks</strong> still need a line from you — an
                  evening, not a weekend.
                </span>
              </p>
            )}
            {verdict && verdict.sheetsLate > 0 && (
              <p>
                <span className="dot" aria-hidden="true" />
                <span>
                  <strong>
                    {verdict.sheetsLate} record{' '}
                    {verdict.sheetsLate === 1 ? 'sheet is' : 'sheets are'} past the deadline.
                  </strong>{' '}
                  They still count — writing them up is all that is left.
                </span>
              </p>
            )}
          </div>

          <div className="actions">
            {onKeep === 'account' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  stashPending({
                    experienceStart: start,
                    entries: done.entries,
                    weeks: done.recovered,
                    months: done.monthsRecovered,
                  })
                  // A full navigation, not a router push: this component also
                  // runs outside a Next app, where there is no router to push.
                  window.location.assign('/sign-up')
                }}
              >
                Keep this
              </button>
            )}
            {canSave && (
              <button
                type="button"
                className={onKeep === 'export' ? 'btn btn-primary' : 'btn'}
                onClick={() => { void download(done) }}
              >
                Download a copy
              </button>
            )}
          </div>

          <Found report={done} />
        </div>
      )}
    </div>
  )
}

const CSV_HEAD = ['Date', 'Hours', 'Activity', 'People', 'Project']

function toCsv(report: RecoveryReport): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rows = report.entries.map((e) =>
    [
      e.date,
      (e.minutes / 60).toFixed(2),
      e.activity,
      e.people.join('; '),
      e.projectHint ?? '',
    ].map(cell).join(','),
  )
  return [CSV_HEAD.join(','), ...rows].join('\r\n')
}

/**
 * Some hosts do not let a page start a download of its own; they mediate it
 * and ask the viewer first. Where that is the case the file has to be handed
 * over rather than linked to, or the button does nothing at all.
 */
interface DownloadHost {
  use(name: 'downloads'): Promise<{
    save(request: { filename: string; data: string }): Promise<unknown>
  } | null>
}

function host(): DownloadHost | null {
  const value = (globalThis as { claude?: unknown }).claude
  return value && typeof (value as DownloadHost).use === 'function'
    ? (value as DownloadHost)
    : null
}

async function download(report: RecoveryReport) {
  const filename = `pedr-recovered-${report.from}-to-${report.to}.csv`
  const csv = toCsv(report)

  const mediated = host()
  if (mediated) {
    const downloads = await mediated.use('downloads')
    // The viewer is asked, and may decline. Declining is an answer, not a
    // failure, so there is nothing to report and nothing to retry.
    if (downloads) await downloads.save({ filename, data: csv }).catch(() => {})
    return
  }

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Found({ report }: { report: RecoveryReport }) {
  return (
    <details className="found">
      <summary>See what it found</summary>
      <ul className="found-list">
        {report.entries.slice(0, 8).map((entry, i) => (
          <li key={`${entry.date}-${i}`}>
            <span className="found-date">{formatDate(entry.date)}</span>
            <span>{entry.activity}</span>
          </li>
        ))}
      </ul>
      {report.entries.length > 8 && (
        <p className="hint" style={{ marginTop: 10 }}>
          and {report.entries.length - 8} more
        </p>
      )}
    </details>
  )
}
