'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { RecoveryGrid } from './recovery-grid'
import { recoveryWindow, triage, type RecoveryReport, type Trouble } from '@/lib/pedr/recover'
import { SHEET_RULES } from '@/lib/pedr/constants'
import { isDateKey, weekIdOf, weekRange, type WeekId } from '@/lib/pedr/week'

/**
 * The public tool.
 *
 * This used to be a form followed by four hundred words explaining what the
 * form would tell you. It now shows you instead: your two years as a register
 * of week-squares, hollow, and a button that fills them from your calendar.
 *
 * One question is asked, because one is all that is needed before the drawing
 * can be drawn. Everything else — how much you have logged, how many weeks are
 * holes, how many months you can actually claim — comes out of the file, which
 * is more honest than asking somebody to estimate it.
 */

const TONE: Record<Trouble, { chip: string; word: string }> = {
  fine: { chip: 'chip-ink', word: 'On top of it' },
  slipping: { chip: 'chip-signal', word: 'Slipping' },
  behind: { chip: 'chip-signal', word: 'Behind' },
  serious: { chip: 'chip-revision', word: 'Needs a weekend' },
}

type Phase =
  | { at: 'idle' }
  | { at: 'working' }
  | { at: 'error'; message: string }
  | { at: 'done'; report: RecoveryReport; label: string }

const MAX_BYTES = 8_000_000

export function CatchUpTool() {
  const [start, setStart] = useState('')
  const [sheets, setSheets] = useState(0)
  const [phase, setPhase] = useState<Phase>({ at: 'idle' })

  const window = useMemo(() => (isDateKey(start) ? recoveryWindow(start) : null), [start])

  const verdict = useMemo(() => {
    if (!window) return null
    // Once a calendar has been read, the week count is measured rather than
    // guessed — which is the whole reason this asks one question instead of three.
    const weeksLogged = phase.at === 'done' ? phase.report.recovered : 0
    return triage({ experienceStart: start, sheetsDone: sheets, weeksLogged })
  }, [window, start, sheets, phase])

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
    if (!file || !window) return
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
        ? ingest.calendarToEntries(ingest.parseCalendar(text, window))
        : ingest.parseDump(text, { reference: window.to }).entries.filter(
            (e) => e.date >= window.from && e.date <= window.to,
          )

      if (entries.length === 0) {
        setPhase({
          at: 'error',
          message: 'Nothing in that file falls inside your dates. Most exports default to a month.',
        })
        return
      }
      const report = recovery.recover({
        ...window,
        sources: [{ source: isIcs ? 'calendar' : 'timesheet', label: file.name, entries }],
      })
      setPhase({ at: 'done', report, label: file.name })
    } catch {
      setPhase({ at: 'error', message: 'Could not read that. An .ics export is what this wants.' })
    }
  }

  const done = phase.at === 'done' ? phase.report : null
  const total = window ? weekRange(window.from, window.to).length : 0
  const tone = verdict ? TONE[verdict.trouble] : null

  return (
    <div className="tool">
      <div className="tool-head">
        <h1>How much of your PEDR is already written down?</h1>
        <p className="dim small">
          Almost none of it, by hand. Almost all of it, in your calendar.
        </p>
      </div>

      {/* One question. The drawing needs a start date and nothing else. */}
      <div className="tool-ask">
        <div className="field">
          <label htmlFor="start">Experience started</label>
          <input
            id="start"
            type="date"
            value={start}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setStart(e.target.value); setPhase({ at: 'idle' }) }}
          />
        </div>
        <div className="field" style={{ maxWidth: 130 }}>
          <label htmlFor="sheets">Sheets signed off</label>
          <input
            id="sheets"
            type="number"
            min={0}
            max={SHEET_RULES.requiredSheets}
            value={sheets}
            onChange={(e) => setSheets(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
      </div>

      {window && (
        <>
          {/* The drawing. This is the argument; the words above are a caption. */}
          <div className="tool-figures">
            <Figure value={done ? `${done.recovered}` : '0'} of={`${total}`} label="Weeks with something in them" />
            <Figure value={done ? `${done.monthsRecovered}` : '0'} of="24" label="Months you could claim" />
            <Figure
              value={done ? `${done.blank.length}` : `${total}`}
              label="Weeks that are holes"
              alarm={!done || done.blank.length > 0}
            />
            {tone && (
              <div className="tool-figure">
                <span className={`chip ${tone.chip}`}>{tone.word}</span>
                <span className="tiny faint" style={{ marginTop: 6 }}>
                  {verdict!.sheetsLate === 0
                    ? 'Nothing past its deadline'
                    : `${verdict!.sheetsLate} sheet${verdict!.sheetsLate === 1 ? '' : 's'} past the deadline`}
                </span>
              </div>
            )}
          </div>

          <RecoveryGrid {...window} recovered={recovered} animate />

          <div className="tool-act">
            {!done && (
              <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                {phase.at === 'working' ? 'Reading…' : 'Fill it from my calendar'}
                <input
                  type="file"
                  accept=".ics,text/calendar,.csv,.tsv,text/csv,text/plain"
                  hidden
                  onChange={(e) => { void read(e.target.files?.[0]); e.target.value = '' }}
                />
              </label>
            )}
            {done && <Link href="/sign-up" className="btn btn-primary">Keep these {done.entries.length} entries</Link>}
            <span className="tiny faint">
              Read in this tab. Never uploaded.{' '}
              {!done && 'Outlook: File → Save Calendar. Google: Settings → Export.'}
            </span>
          </div>

          {phase.at === 'error' && (
            <p className="small" style={{ color: 'var(--alarm-text)' }}>{phase.message}</p>
          )}

          {done && <Found report={done} />}
        </>
      )}
    </div>
  )
}

function Figure({
  value, of, label, alarm,
}: { value: string; of?: string; label: string; alarm?: boolean }) {
  return (
    <div className="tool-figure">
      <span className="figure-sm" style={alarm ? { color: 'var(--alarm-text)' } : undefined}>
        {value}
        {of && <span className="tool-of">/{of}</span>}
      </span>
      <span className="tiny faint">{label}</span>
    </div>
  )
}

/** What came back, as evidence rather than as a claim. */
function Found({ report }: { report: RecoveryReport }) {
  const sample = report.entries.slice(0, 6)
  return (
    <div className="tool-found">
      <div className="stack-s">
        <span className="label">What it found</span>
        <ul className="found-list">
          {sample.map((entry, i) => (
            <li key={`${entry.date}-${i}`}>
              <span className="ref">{entry.date}</span>
              <span>{entry.activity}</span>
            </li>
          ))}
        </ul>
        {report.entries.length > sample.length && (
          <span className="tiny faint">+{report.entries.length - sample.length} more</span>
        )}
      </div>

      {report.prompts.length > 0 && (
        <div className="stack-s">
          <span className="label">The holes it left</span>
          <ul className="found-list">
            {report.prompts.slice(0, 4).map((p) => (
              <li key={p.weekId}>
                <span className="ref">{p.label}</span>
                <span>{p.ask}</span>
              </li>
            ))}
          </ul>
          {report.prompts.length > 4 && (
            <span className="tiny faint">+{report.prompts.length - 4} more</span>
          )}
        </div>
      )}
    </div>
  )
}
