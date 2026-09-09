'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { recoveryWindow, triage, type Trouble } from '@/lib/pedr/recover'
import { RecoverPreview } from './recover-preview'
import { SHEET_RULES } from '@/lib/pedr/constants'
import { isDateKey } from '@/lib/pedr/week'

/**
 * Am I in trouble?
 *
 * The question everybody actually arrives with, and the reason they have not
 * opened their PEDR since February. It runs in the browser with no account,
 * because asking somebody to sign up before you answer the thing they are
 * frightened of is how you never find out they were frightened.
 *
 * The tone is the whole design. Fear of a PEDR is almost always worse than the
 * PEDR: people imagine "I have lost that year" and the truth is nearly always
 * "that year is in your calendar, the deadline is soft, this is a weekend".
 * But it does not soften the bad cases either — a tool that tells somebody
 * nine months behind that they are doing great gets closed and never reopened.
 */

const TONE: Record<Trouble, { band: string; label: string }> = {
  fine: { band: 'band-ink', label: 'You are fine' },
  slipping: { band: 'band-signal', label: 'Slipping' },
  behind: { band: 'band-signal', label: 'Behind — like everyone' },
  serious: { band: 'band-alarm', label: 'This needs a weekend' },
}

export function Triage() {
  const [start, setStart] = useState('')
  const [sheets, setSheets] = useState(0)
  const [logged, setLogged] = useState<'none' | 'some' | 'most'>('none')
  const [shown, setShown] = useState(false)

  const result = useMemo(() => {
    if (!isDateKey(start)) return null
    // Weeks logged is asked as a feel rather than a number, because nobody
    // knows their week count and a wrong number here would make the verdict
    // wrong in the direction that matters.
    const elapsedWeeks = Math.max(
      0,
      Math.round((Date.now() - new Date(`${start}T00:00:00Z`).getTime()) / 604_800_000),
    )
    const share = logged === 'none' ? 0.05 : logged === 'some' ? 0.4 : 0.85
    return triage({
      experienceStart: start,
      sheetsDone: sheets,
      weeksLogged: Math.round(elapsedWeeks * share),
    })
  }, [start, sheets, logged])

  const tone = result ? TONE[result.trouble] : null

  return (
    <div className="stack-l" style={{ maxWidth: 640 }}>
      <div className="stack-s">
        <span className="label">Sixty seconds, no account</span>
        <h1>Am I in trouble?</h1>
        <p className="dim">
          Three questions and a straight answer, including if it is a bad one — but the bad one is
          almost never as bad as the thing you have been imagining. Then, if you want, drop your
          calendar in and watch the missing months come back. It is read in this tab and goes
          nowhere.
        </p>
      </div>

      <section className="sheet stack">
        <div className="field">
          <label htmlFor="start">When did your practical experience start?</label>
          <input
            id="start"
            type="date"
            value={start}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => { setStart(e.target.value); setShown(false) }}
          />
          <span className="hint">
            Best guess. Your first day at the practice you are in now, if you are not sure.
          </span>
        </div>

        <div className="field">
          <label htmlFor="sheets">How many record sheets have you actually finished?</label>
          <input
            id="sheets"
            type="number"
            min={0}
            max={SHEET_RULES.requiredSheets}
            value={sheets}
            onChange={(e) => { setSheets(Number(e.target.value) || 0); setShown(false) }}
          />
          <span className="hint">Finished and signed. Not started, not nearly.</span>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 8 }}>
            How much of the time have you got written down anywhere?
          </legend>
          <div className="row-wrap" style={{ gap: 5 }}>
            {[
              ['none', 'Barely any'],
              ['some', 'Patchy'],
              ['most', 'Most of it'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`chip ${logged === id ? 'chip-ink' : ''}`}
                style={{ cursor: 'pointer' }}
                aria-pressed={logged === id}
                onClick={() => { setLogged(id as typeof logged); setShown(false) }}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!isDateKey(start)}
          onClick={() => setShown(true)}
        >
          Tell me
        </button>
      </section>

      {shown && result && tone && (
        <div className="stack">
          <div className={`band ${tone.band}`}>
            <span className="label">{tone.label}</span>
            <strong>
              {result.sheetsLate === 0
                ? 'Nothing overdue'
                : `${result.sheetsLate} ${result.sheetsLate === 1 ? 'sheet' : 'sheets'} past the deadline`}
            </strong>
            <span className="small">{result.verdict}</span>
          </div>

          <div className="titleblock">
            <div>
              <span className="label">Months elapsed</span>
              <span className="value">{result.monthsElapsed}</span>
            </div>
            <div>
              <span className="label">Sheets due</span>
              <span className="value">{result.sheetsDue}</span>
            </div>
            <div>
              <span className="label">Done</span>
              <span className="value">{result.sheetsDone}</span>
            </div>
            <div>
              <span className="label">Weeks blank</span>
              <span className="value">{result.weeksMissing}</span>
            </div>
          </div>

          <section className="sheet stack-s">
            <div className="sheet-head">
              <div>
                <span className="label">In this order</span>
                <h2 style={{ marginTop: 3 }}>What to do</h2>
              </div>
            </div>
            <ol className="stack-s" style={{ paddingLeft: 20, listStyleType: 'decimal' }}>
              {result.steps.map((step) => (
                <li key={step} className="small dim">{step}</li>
              ))}
            </ol>
          </section>

          {result.recoverable && result.weeksMissing > 4 && (
            <div className="note note-ink">
              <span aria-hidden="true">→</span>
              <span>
                <strong>Most of those {result.weeksMissing} weeks still exist.</strong> Your
                calendar has every meeting you sat in, who was there and how long it ran. Your
                practice timesheet has the hours and the job numbers. Catching up starts by
                pulling those in — not by trying to remember {result.monthsElapsed} months.
              </span>
            </div>
          )}

          {/* The claim above is the whole product, and until now the next thing
              this page did was ask for an account. Prove it instead. */}
          <RecoverPreview {...recoveryWindow(start)} />

          <div className="row-wrap">
            <Link href="/sign-up" className="btn btn-primary">Start catching up</Link>
            <Link href="/what-is-a-pedr" className="btn">First, show me what one looks like</Link>
          </div>

          <p className="tiny faint">
            Worked out in your browser from three answers — nothing was sent anywhere and nothing
            was stored. It is an estimate of your position, not a ruling: your PSA and RIBA&rsquo;s
            own system are the authority on where you actually stand.
          </p>
        </div>
      )}
    </div>
  )
}
