import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getDashboard } from '@/lib/data'
import { SHEET_RULES } from '@/lib/pedr/constants'
import { describeWindow, signOffState } from '@/lib/pedr/deadlines'
import { formatDate } from '@/lib/pedr/week'

export const metadata = { title: 'Record sheets · PEDR' }
export const dynamic = 'force-dynamic'

export default async function SheetsPage() {
  const user = await requireUser()
  const d = await getDashboard(user.id, { experienceStart: user.experienceStart })

  if (d.deadlines.periods.length === 0) {
    return (
      <div className="stack-l">
        <h1>Record sheets</h1>
        <div className="note note-accent">
          <span aria-hidden="true">→</span>
          <span>
            Set the date your practical experience started and the quarters appear here, each with
            its own deadline. <Link href="/settings" style={{ color: 'var(--accent)' }}>Settings</Link>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>Record sheets</h1>
        <p className="dim">
          {d.deadlines.completeCount} of {SHEET_RULES.requiredSheets} signed off.
          {d.deadlines.lateCount > 0 && (
            <> <strong style={{ color: 'var(--critical-ink)' }}>
              {d.deadlines.lateCount} past the deadline.
            </strong></>
          )}
        </p>
      </div>

      {d.deadlines.headline && (
        <div className="note note-critical">
          <span aria-hidden="true">⚠</span>
          <span>{d.deadlines.headline}</span>
        </div>
      )}

      <div className="stack-s">
        {d.deadlines.periods.map((period) => {
          const sheet = d.sheets.find((s) => s.id === period.sheetId) ?? null
          const state = signOffState(sheet, d.today)
          return (
            <div className="card stack-s" key={period.index}>
              <div className="row-wrap">
                <h2>Sheet {period.index}</h2>
                <span className="muted small">
                  {formatDate(period.periodStart, { year: false })} – {formatDate(period.periodEnd)}
                </span>
                <span className="spacer" />
                {period.late ? (
                  <span className="badge badge-critical">
                    <span aria-hidden="true">⚠</span> {period.daysLate} days late
                  </span>
                ) : period.inProgress ? (
                  <span className="badge">in progress</span>
                ) : (
                  <span className="badge badge-warning">
                    <span aria-hidden="true">◷</span> {period.daysUntilDue} days left
                  </span>
                )}
              </div>

              <div className="row-wrap" style={{ gap: 8 }}>
                <div className="bar-track" style={{ flex: 1, minWidth: 160 }}>
                  <div className="bar-fill" style={{ width: `${state.progress * 100}%` }} />
                </div>
                <span className="small muted" style={{ minWidth: 130 }}>{state.label}</span>
              </div>

              {state.chase && (
                <p className="note note-warning small">
                  <span aria-hidden="true">◷</span> {state.chase}
                </p>
              )}

              <div className="row-wrap">
                <span className="small muted">{describeWindow(period)}</span>
                <span className="spacer" />
                <Link href={`/sheets/${period.periodStart}`} className="btn btn-sm">
                  {period.inProgress ? 'Preview' : 'Open'}
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <p className="small muted">
        These are drafts to check and paste. The record RIBA holds is at pedr.co.uk, and that is
        where your mentor and PSA sign.
      </p>
    </div>
  )
}
