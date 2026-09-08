import Link from 'next/link'
import { CoverageSchedule, Register, ScaleBar, Stat, Trend } from '@/components/charts'
import type { RegisterRow } from '@/components/charts'
import { requireUser } from '@/lib/auth'
import { getDashboard } from '@/lib/data'
import { REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'
import { describeWindow } from '@/lib/pedr/deadlines'
import { FIRST_MESSAGE } from '@/lib/pedr/guidance'
import { formatDate, formatDuration, formatWeek, weekIdOf } from '@/lib/pedr/week'

export const metadata = { title: 'PEDR' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requireUser()
  const d = await getDashboard(user.id, { experienceStart: user.experienceStart })

  const started = d.entries.length > 0
  const thisWeek = weekIdOf(d.today)
  const thisWeekScore = d.scores.find((s) => s.weekId === thisWeek)
  const employer = d.employments[0]?.employer ?? '—'

  // Register rows are thirteen weeks each, which is one record sheet, so each
  // row can carry the sheet's own reference and where it has got to.
  const registerRows: RegisterRow[] = d.deadlines.periods.map((p) => ({
    ref: `PEDR-${String(p.index).padStart(2, '0')}`,
    href: `/sheets/${p.periodStart}`,
    ...(p.status === 'psa_signed'
      ? { status: 'signed' as const, statusLabel: 'signed' }
      : p.late
        ? { status: 'revision' as const, statusLabel: `${p.daysLate}d late` }
        : p.inProgress
          ? { status: 'none' as const, statusLabel: 'open' }
          : { status: 'pending' as const, statusLabel: `${p.daysUntilDue}d left` }),
  }))

  return (
    <div className="stack-l">
      {/* The title block. Who, where, over what period, and what is outstanding. */}
      <div className="titleblock no-print">
        <div>
          <span className="label">Candidate</span>
          <span className="value">{user.name}</span>
        </div>
        <div>
          <span className="label">Practice</span>
          <span className="value">{employer}</span>
        </div>
        <div>
          <span className="label">Record from</span>
          <span className="value">
            {d.progress.firstDate ? formatDate(d.progress.firstDate) : '—'}
          </span>
        </div>
        <div>
          <span className="label">Sheets</span>
          <span className="value">
            {d.deadlines.completeCount}/{SHEET_RULES.requiredSheets}
          </span>
        </div>
        <div>
          <span className="label">Outstanding</span>
          <span
            className="value"
            style={d.deadlines.lateCount > 0 ? { color: 'var(--revision-ink)' } : undefined}
          >
            {d.deadlines.lateCount > 0 ? `${d.deadlines.lateCount} late` : 'none'}
          </span>
        </div>
      </div>

      {/* The hero. Not a stat grid — the one date everything else is about. */}
      <section className="sheet" style={{ padding: '26px 22px' }}>
        <div className="row-wrap" style={{ gap: 30, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <Sitting progress={d.progress} started={started} />
          </div>

          <div style={{ flex: '1 1 340px', minWidth: 260 }}>
            <div className="stack-s" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">Months served</span>
                <span className="ref" style={{ color: 'var(--ink)' }}>
                  {d.progress.monthsLogged} / {REQUIREMENTS.minTotalMonths}
                </span>
              </div>
              <ScaleBar
                value={d.progress.monthsLogged}
                total={REQUIREMENTS.minTotalMonths}
                ticks={[0, 6, 12, 18, 24]}
              />
              <div className="stack-s" style={{ gap: 6, marginTop: 12 }}>
                {d.progress.checks.map((check) => (
                  <div key={check.id} className="row" style={{ gap: 9, alignItems: 'baseline' }}>
                    <span className={`mark ${check.met ? 'mark-signed' : 'mark-none'}`} style={{ flex: 'none' }} />
                    <span className="small" style={{ color: check.met ? 'var(--ink-2)' : 'var(--ink)' }}>
                      {check.label}
                    </span>
                    {!check.regulatory && <span className="chip">house rule</span>}
                    <span className="spacer" />
                    <span className="ref">{check.value}/{check.target}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* One instruction, in priority order. */}
      <Instruction
        started={started}
        deadlineNote={d.deadlines.headline}
        coverageNote={d.coverageNote}
        thisWeekLogged={(thisWeekScore?.score ?? 0) > 0}
        unverified={d.unverified}
      />

      {/* The register — the signature view. */}
      <section className="sheet">
        <div className="sheet-head">
          <div>
            <span className="label">
              {d.scores.length} weeks · {d.progress.firstDate ? formatDate(d.progress.firstDate, { year: false }) : ''} – {formatDate(d.today)}
            </span>
            <h2 style={{ marginTop: 3 }}>Register</h2>
          </div>
          <Link href="/weeks" className="btn btn-sm no-print">Every week</Link>
        </div>
        <Register
          weeks={d.scores.map((s) => ({
            weekId: s.weekId,
            score: s.score,
            minutes: s.minutes,
            entryCount: s.entryCount,
          }))}
          today={thisWeek}
          rows={registerRows}
        />
      </section>

      <div className="grid grid-4">
        <div className="sheet sheet-tight">
          <Stat
            label="This week"
            value={thisWeekScore && thisWeekScore.score > 0 ? String(thisWeekScore.score) : '—'}
            sub={thisWeekScore && thisWeekScore.score > 0 ? 'out of 100' : 'nothing logged'}
            tone={!thisWeekScore || thisWeekScore.score === 0 ? 'revision' : 'ink'}
          />
        </div>
        <div className="sheet sheet-tight">
          <Stat label="Run" value={String(d.streak)} sub={`weeks unbroken · best ${d.best}`} />
        </div>
        <div className="sheet sheet-tight">
          <Stat
            label="Recorded"
            value={formatDuration(d.progress.totalMinutes).replace(/\s.*/, '')}
            sub={`hours · ${d.entries.length} entries`}
          />
        </div>
        <div className="sheet sheet-tight">
          <Stat
            label="Weeks missing"
            value={String(d.scores.filter((s) => s.score === 0).length)}
            sub={d.gaps.length > 0 ? `in ${d.gaps.length} runs` : 'none'}
            tone={d.gaps.some((g) => g.count >= SHEET_RULES.maxPeriodMonths * 4) ? 'revision' : 'ink'}
          />
        </div>
      </div>

      <div className="grid grid-2">
        <section className="sheet">
          <div className="sheet-head">
            <div>
              <span className="label">RIBA Plan of Work 2020</span>
              <h2 style={{ marginTop: 3 }}>Work stages</h2>
            </div>
          </div>
          <CoverageSchedule
            rows={d.coverage.stages.map((s) => ({
              id: s.id,
              code: s.id,
              label: s.label.split(' · ')[1] ?? s.label,
              value: s.minutes,
              weeks: s.weeks,
              share: s.share,
            }))}
          />
        </section>

        <section className="sheet">
          <div className="sheet-head">
            <div>
              <span className="label">ARB criteria at Part 3</span>
              <h2 style={{ marginTop: 3 }}>Professional criteria</h2>
            </div>
            <Link href="/coverage" className="btn btn-sm no-print">Detail</Link>
          </div>
          <CoverageSchedule
            rows={d.coverage.criteria.map((c) => ({
              id: c.id,
              code: c.id,
              label: c.label.split(' · ')[1] ?? c.label,
              value: c.minutes,
              weeks: c.weeks,
              share: c.share,
            }))}
          />
        </section>
      </div>

      <div className="grid grid-2">
        <section className="sheet">
          <div className="sheet-head">
            <div>
              <span className="label">Average week score</span>
              <h2 style={{ marginTop: 3 }}>Month by month</h2>
            </div>
          </div>
          <Trend points={d.months.map((m) => ({ key: m.monthKey, label: m.label, value: m.averageScore }))} />
        </section>

        <section className="sheet">
          <div className="sheet-head">
            <div>
              <span className="label">Runs of empty weeks</span>
              <h2 style={{ marginTop: 3 }}>Holes in the record</h2>
            </div>
            <Link href="/dump" className="btn btn-sm no-print">Fill one in</Link>
          </div>
          {d.gaps.length === 0 ? (
            <p className="small faint">
              {started ? 'None. That is rare — keep going.' : 'Nothing logged yet.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {d.gaps.slice(-7).reverse().map((gap, i) => (
                <div
                  key={gap.from}
                  className="row"
                  style={{ gap: 10, padding: '7px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hair)' }}
                >
                  <Link href={`/weeks/${gap.from}`} className="small" style={{ textDecoration: 'none' }}>
                    {gap.count === 1
                      ? formatWeek(gap.from)
                      : `${formatWeek(gap.from)} → ${formatWeek(gap.to)}`}
                  </Link>
                  <span className="spacer" />
                  <span className={gap.count >= 13 ? 'mark mark-revision' : 'ref'}>
                    {gap.count} {gap.count === 1 ? 'week' : 'weeks'}
                  </span>
                </div>
              ))}
              {d.gaps.length > 7 && (
                <p className="tiny faint" style={{ paddingTop: 8 }}>
                  and {d.gaps.length - 7} more further back.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {d.deadlines.periods.length > 0 && (
        <section className="sheet">
          <div className="sheet-head">
            <div>
              <span className="label">{SHEET_RULES.requiredSheets} required · due 2 months after each period</span>
              <h2 style={{ marginTop: 3 }}>Issue schedule</h2>
            </div>
            <Link href="/sheets" className="btn btn-sm no-print">Open</Link>
          </div>
          <div className="table-scroll">
            <table className="schedule">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {d.deadlines.periods.map((p) => (
                  <tr key={p.index}>
                    <td>
                      <Link href={`/sheets/${p.periodStart}`} className="ref" style={{ color: 'var(--ink)' }}>
                        PEDR-{String(p.index).padStart(2, '0')}
                      </Link>
                    </td>
                    <td className="dim small">
                      {formatDate(p.periodStart, { year: false })} – {formatDate(p.periodEnd)}
                    </td>
                    <td>
                      {p.status === 'psa_signed' ? (
                        <span className="mark mark-signed">signed off</span>
                      ) : p.late ? (
                        <span className="mark mark-revision">late</span>
                      ) : p.inProgress ? (
                        <span className="mark mark-none">open</span>
                      ) : (
                        <span className="mark mark-pending">{p.status.replace('_', ' ')}</span>
                      )}
                    </td>
                    <td className="dim small">{describeWindow(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * The hero. The honest answer to the only question anyone has, which is not
 * "how many months have I logged" but "when can I sit the exam".
 */
function Sitting({
  progress,
  started,
}: {
  progress: Awaited<ReturnType<typeof getDashboard>>['progress']
  started: boolean
}) {
  if (!started) {
    return (
      <div className="stack-s">
        <span className="label">Earliest sitting</span>
        <span className="figure" style={{ color: 'var(--ink-3)' }}>Not yet known</span>
        <p className="small dim" style={{ maxWidth: '38ch' }}>
          Log a week and a date appears here. It moves as you go, and it is the only number on this
          page that matters.
        </p>
      </div>
    )
  }

  if (progress.ready) {
    return (
      <div className="stack-s">
        <span className="label">Earliest sitting</span>
        <span className="figure" style={{ color: 'var(--signed-ink)' }}>Now</span>
        <p className="small dim" style={{ maxWidth: '38ch' }}>
          You have served the experience. Keep logging until the exam — the recency rule is
          measured on the day you sit, not today.
        </p>
      </div>
    )
  }

  if (!progress.projectedReadyDate) {
    return (
      <div className="stack-s">
        <span className="label">Earliest sitting</span>
        <span className="figure" style={{ color: 'var(--ink-3)' }}>Adrift</span>
        <p className="small dim" style={{ maxWidth: '38ch' }}>
          Nothing logged recently, so there is no rate to project from. Log this week and a date
          comes back.
        </p>
      </div>
    )
  }

  const date = formatDate(progress.projectedReadyDate)
  const [day, month, year] = date.split(' ')

  return (
    <div className="stack-s">
      <span className="label">Earliest sitting</span>
      <span className="figure">
        {day} {month}
        <span style={{ color: 'var(--ink-3)' }}> {year}</span>
      </span>
      <p className="small dim" style={{ maxWidth: '40ch' }}>
        {progress.weeksRemaining} more weeks to serve, at the {Math.round(progress.loggingRate * 100)}%
        {' '}logging rate you have kept up over the last quarter. Miss weeks and this date moves.
      </p>
    </div>
  )
}

function Instruction({
  started,
  deadlineNote,
  coverageNote,
  thisWeekLogged,
  unverified,
}: {
  started: boolean
  deadlineNote: string | null
  coverageNote: string | null
  thisWeekLogged: boolean
  unverified: number
}) {
  if (!started) {
    return (
      <div className="note note-ink">
        <span className="label" style={{ paddingTop: 2 }}>Start</span>
        <span>
          {FIRST_MESSAGE}{' '}
          <Link href="/dump" style={{ fontWeight: 500 }}>Log this week →</Link>
        </span>
      </div>
    )
  }
  if (deadlineNote) {
    return (
      <div className="note note-revision">
        <span className="label" style={{ paddingTop: 2, color: 'var(--revision-ink)' }}>Overdue</span>
        <span>{deadlineNote} <Link href="/sheets" style={{ fontWeight: 500 }}>Open the schedule →</Link></span>
      </div>
    )
  }
  if (unverified > 0) {
    return (
      <div className="note note-pending">
        <span className="label" style={{ paddingTop: 2 }}>Check</span>
        <span>
          <strong>{unverified}</strong> {unverified === 1 ? 'entry has' : 'entries have'} not been read
          by anyone yet. <Link href="/review" style={{ fontWeight: 500 }}>Review →</Link>
        </span>
      </div>
    )
  }
  if (!thisWeekLogged) {
    return (
      <div className="note note-ink">
        <span className="label" style={{ paddingTop: 2 }}>Today</span>
        <span>
          Nothing logged this week. Two minutes now is an hour saved at the end of the quarter.{' '}
          <Link href="/dump" style={{ fontWeight: 500 }}>Dump it →</Link>
        </span>
      </div>
    )
  }
  if (coverageNote) {
    return (
      <div className="note">
        <span className="label" style={{ paddingTop: 2 }}>Note</span>
        <span>{coverageNote} <Link href="/coverage" style={{ fontWeight: 500 }}>Coverage →</Link></span>
      </div>
    )
  }
  return (
    <div className="note">
      <span className="label" style={{ paddingTop: 2 }}>Clear</span>
      <span>Nothing needs you. The record is in good order.</span>
    </div>
  )
}
