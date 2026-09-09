'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { DateKey } from '@/lib/pedr/week'
import type { RecoveryReport } from '@/lib/pedr/recover'

/**
 * Prove it on their calendar, before asking for anything.
 *
 * The triage above this says "most of those weeks still exist — your calendar
 * has every meeting you sat in". Until now the next thing it said was "make an
 * account", which asks somebody to believe a claim about their own data on
 * trust. Nobody does.
 *
 * So this runs the real recovery engine — the same functions the signed-in app
 * runs — over a file they choose, in their browser. They see their own
 * meetings come back with their own colleagues' names on them, and the weeks
 * it could not reach listed honestly. Then, and only then, an account.
 *
 * Nothing is uploaded. That is not a reassurance written for this box, it is
 * how the code works: the engine is pure, there is no fetch on this path, and
 * a work calendar is exactly the kind of file somebody is right to be careful
 * with.
 */

type State =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; report: RecoveryReport; kind: 'calendar' | 'timesheet'; label: string }

const MAX_BYTES = 8_000_000

export function RecoverPreview({ from, to }: { from: DateKey; to: DateKey }) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [pasted, setPasted] = useState('')

  async function run(text: string, label: string) {
    setState({ phase: 'working' })
    try {
      // Loaded on demand. The parsers and the recovery engine are a large
      // chunk of JavaScript, and most people who read this page never open
      // this box — they should not pay for it.
      const [ingest, recovery] = await Promise.all([
        import('@/lib/ingest'),
        import('@/lib/pedr/recover'),
      ])

      const isIcs = /BEGIN:VCALENDAR/i.test(text.slice(0, 4000))
      const entries = isIcs
        ? ingest.calendarToEntries(ingest.parseCalendar(text, { from, to }))
        : ingest.parseDump(text, { reference: to }).entries.filter(
            (e) => e.date >= from && e.date <= to,
          )

      if (entries.length === 0) {
        setState({
          phase: 'error',
          message: isIcs
            ? 'That is a calendar, but nothing in it falls inside the period you gave above. ' +
              'Check the export covers the right dates — most tools default to the last month.'
            : 'Nothing dated came out of that. A calendar export (.ics) or a timesheet with a ' +
              'date column is what this can read.',
        })
        return
      }

      const report = recovery.recover({
        from,
        to,
        sources: [{ source: isIcs ? 'calendar' : 'timesheet', label, entries }],
      })
      setState({ phase: 'done', report, kind: isIcs ? 'calendar' : 'timesheet', label })
    } catch (error) {
      setState({
        phase: 'error',
        message:
          'That file could not be read. If it came out of Outlook or Google Calendar as .ics it ' +
          `should work — otherwise it may be a format this does not know yet. (${String(error)})`,
      })
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setState({
        phase: 'error',
        message:
          'That file is very large. Export a shorter range — a year at a time is plenty, and the ' +
          'whole thing has to fit in this tab.',
      })
      return
    }
    // Read before entering the async engine so a slow disk cannot leave the
    // button looking dead.
    const text = await file.text()
    await run(text, file.name)
  }

  return (
    <section className="sheet stack">
      <div className="sheet-head">
        <div>
          <span className="label">Still no account</span>
          <h2 style={{ marginTop: 3 }}>Now prove it on yours</h2>
        </div>
      </div>

      <p className="small dim">
        Export your work calendar and drop it in. It is read here, in this tab, by the same engine
        the app runs — <strong style={{ color: 'var(--ink)' }}>nothing is uploaded, nothing is
        stored, and there is no server on this path at all</strong>. Close the tab and it is gone.
      </p>

      <div className="import-choices">
        <label className="btn btn-primary btn-block" style={{ cursor: 'pointer' }}>
          Choose a calendar file
          <input
            type="file"
            accept=".ics,text/calendar,.csv,.tsv,text/csv,text/plain"
            hidden
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }}
          />
        </label>
        <details>
          <summary className="btn btn-block" style={{ cursor: 'pointer' }}>
            Or paste a timesheet
          </summary>
          <div className="stack-s" style={{ marginTop: 10 }}>
            <textarea
              rows={5}
              value={pasted}
              placeholder={'Date\tProject\tPhase\tHours\n2026-03-04\t1042 Battersea\tStage 4\t6.5'}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={pasted.trim().length < 20}
              onClick={() => void run(pasted, 'Pasted timesheet')}
            >
              Read it
            </button>
          </div>
        </details>
      </div>

      <p className="tiny faint">
        Outlook: File → Save Calendar, or right-click the calendar → Share → Publish. Google
        Calendar: Settings → Import &amp; export → Export. Either gives you an <code>.ics</code>.
      </p>

      {state.phase === 'working' && <p className="small">Reading it…</p>}

      {state.phase === 'error' && (
        <div className="note note-revision">
          <span className="label">Could not read that</span>
          <span>{state.message}</span>
        </div>
      )}

      {state.phase === 'done' && <Report state={state} />}
    </section>
  )
}

function Report({ state }: { state: Extract<State, { phase: 'done' }> }) {
  const { report, kind, label } = state
  const source = report.bySource[0]

  return (
    <div className="stack">
      <div className="band band-signal">
        <span className="label">From {label}</span>
        <span className="figure-sm">
          {report.recovered} of {report.total} weeks
        </span>
        <span className="small">{report.headline}</span>
      </div>

      <div className="titleblock">
        <div>
          <span className="label">Entries</span>
          <span className="value">{report.entries.length}</span>
        </div>
        <div>
          <span className="label">Months</span>
          <span className="value">{report.monthsRecovered}</span>
        </div>
        <div>
          <span className="label">Blank weeks</span>
          <span className="value">{report.blank.length}</span>
        </div>
        <div>
          <span className="label">Duplicates</span>
          <span className="value">{source?.duplicates ?? 0}</span>
        </div>
      </div>

      {report.entries.length > 0 && (
        <div className="stack-s">
          <span className="label">Some of what came back</span>
          <div className="table-scroll">
            <table className="schedule">
              <tbody>
                {report.entries.slice(0, 8).map((entry, i) => (
                  <tr key={`${entry.date}-${i}`}>
                    <td style={{ width: 110, whiteSpace: 'nowrap' }}>{entry.date}</td>
                    <td>
                      {entry.activity}
                      {entry.people.length > 0 && (
                        <>
                          <br />
                          <span className="tiny faint">with {entry.people.join(', ')}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.entries.length > 8 && (
            <p className="tiny faint">
              …and {report.entries.length - 8} more. You wrote none of this down, and it was all
              there.
            </p>
          )}
        </div>
      )}

      {report.prompts.length > 0 && (
        <div className="stack-s">
          <span className="label">Weeks it could not reach</span>
          <p className="tiny faint">
            These are the ones that need you. Not &ldquo;what did you do in February&rdquo; —
            each one comes with what was going on either side of it, because recall needs a handle.
          </p>
          {report.prompts.slice(0, 3).map((prompt) => (
            <div className="sheet sheet-tight stack-s" key={prompt.weekId}>
              <strong className="small">{prompt.label}</strong>
              <p className="tiny faint">{prompt.context}</p>
              <p className="small">{prompt.ask}</p>
            </div>
          ))}
          {report.prompts.length > 3 && (
            <p className="tiny faint">…and {report.prompts.length - 3} more like it.</p>
          )}
        </div>
      )}

      <div className="note note-ink">
        <span className="label">This is a preview</span>
        <span>
          <strong>Nothing here has been saved.</strong> It was worked out in this tab and it goes
          when the tab does. An account keeps it, files it against the RIBA work stages and the
          professional criteria, and turns it into the {kind === 'calendar' ? 'sheets' : 'sheets'}{' '}
          you actually submit.
        </span>
      </div>

      <div className="row-wrap">
        <Link href="/sign-up" className="btn btn-primary">Keep these {report.entries.length} entries</Link>
        <Link href="/what-is-a-pedr" className="btn">What do they turn into?</Link>
      </div>
    </div>
  )
}
