import Link from 'next/link'
import { CoverageBars, ScoreTrend, StatTile, WeekHeatmap } from '@/components/charts'
import { requireUser } from '@/lib/auth'
import { getDashboard } from '@/lib/data'
import { FIRST_MESSAGE } from '@/lib/pedr/guidance'
import { REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'
import { describeWindow } from '@/lib/pedr/deadlines'
import { formatDate, formatDuration, formatWeek, weekIdOf } from '@/lib/pedr/week'

export const metadata = { title: 'Dashboard · PEDR' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requireUser()
  const d = await getDashboard(user.id, { experienceStart: user.experienceStart })

  const hasRecord = d.entries.length > 0
  const monthsPct = Math.min(100, (d.progress.monthsLogged / REQUIREMENTS.minTotalMonths) * 100)
  const thisWeek = weekIdOf(d.today)
  const thisWeekScore = d.scores.find((s) => s.weekId === thisWeek)

  return (
    <div className="stack-l">
      <div className="row-wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="stack-s">
          <h1>{greeting(user.name)}</h1>
          <p className="dim small">{formatDate(d.today, { weekday: true })}</p>
        </div>
        <Link href="/dump" className="btn btn-primary">Dump this week</Link>
      </div>

      {/* The one thing that matters right now, said once, at the top. */}
      {!hasRecord ? (
        <div className="note note-accent">
          <div className="stack-s">
            <strong>Start here.</strong>
            <span>{FIRST_MESSAGE}</span>
            <div className="row-wrap" style={{ marginTop: 4 }}>
              <Link href="/dump" className="btn btn-primary btn-sm">Log this week</Link>
              <Link href="/guide" className="btn btn-sm">What is a PEDR?</Link>
            </div>
          </div>
        </div>
      ) : (
        <Headline
          deadlineNote={d.deadlines.headline}
          coverageNote={d.coverageNote}
          thisWeekLogged={(thisWeekScore?.score ?? 0) > 0}
          unverified={d.unverified}
        />
      )}

      {/* Progress to the exam */}
      <section className="card stack">
        <div className="card-head">
          <div className="stack-s" style={{ gap: 2 }}>
            <h2>Can you sit the exam yet?</h2>
            <p className="tiny muted">
              Rules as at {REQUIREMENTS.asOf} · {REQUIREMENTS.source}
            </p>
          </div>
          {d.progress.ready ? (
            <span className="badge badge-good"><span aria-hidden="true">✓</span> Requirements met</span>
          ) : (
            <span className="badge"><span aria-hidden="true">◷</span> Not yet</span>
          )}
        </div>

        <div className="row-wrap" style={{ gap: 28, alignItems: 'flex-end' }}>
          <div className="stack-s" style={{ gap: 2 }}>
            <span className="hero tabular">{d.progress.monthsLogged}</span>
            <span className="small muted">
              of {REQUIREMENTS.minTotalMonths} months logged
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 220 }} className="stack-s">
            <div className="bar-track" style={{ height: 10 }}>
              <div className="bar-fill" style={{ width: `${monthsPct}%` }} />
            </div>
            <p className="tiny muted">
              {d.progress.weeksLogged} weeks on the record.
              {d.progress.weeksRemaining > 0 && d.progress.projectedReadyDate && (
                <> At your current rate ({Math.round(d.progress.loggingRate * 100)}% of weeks logged),
                  you reach {REQUIREMENTS.minTotalMonths} months around{' '}
                  {formatDate(d.progress.projectedReadyDate)}.</>
              )}
              {d.progress.weeksRemaining > 0 && !d.progress.projectedReadyDate && (
                <> Log some weeks and a projected date appears here.</>
              )}
            </p>
          </div>
        </div>

        <div className="stack-s">
          {d.progress.checks.map((check) => (
            <div key={check.id} className="check-row">
              <span
                aria-hidden="true"
                style={{ color: check.met ? 'var(--good-ink)' : 'var(--ink-muted)', width: 14 }}
              >
                {check.met ? '✓' : '○'}
              </span>
              <span className="small check-label" style={{ fontWeight: 500 }}>
                {check.label}
                {!check.regulatory && (
                  <span className="badge tiny" style={{ marginLeft: 8 }}>our advice, not a rule</span>
                )}
              </span>
              <span className="small tabular muted check-value">
                {check.value} / {check.target} {check.unit}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Numbers */}
      <div className="grid grid-4">
        <StatTile
          label="This week"
          value={thisWeekScore && thisWeekScore.score > 0 ? `${thisWeekScore.score}` : '—'}
          sub={thisWeekScore && thisWeekScore.score > 0 ? 'out of 100' : 'nothing logged yet'}
          tone={!thisWeekScore || thisWeekScore.score === 0 ? 'warning' : thisWeekScore.score >= 85 ? 'good' : 'default'}
        />
        <StatTile
          label="Streak"
          value={`${d.streak}`}
          sub={d.streak === 0 ? `best was ${d.best}` : `weeks in a row · best ${d.best}`}
          tone={d.streak >= 4 ? 'good' : 'default'}
        />
        <StatTile
          label="Sheets signed off"
          value={`${d.deadlines.completeCount}`}
          sub={`of ${SHEET_RULES.requiredSheets} needed`}
          tone={d.deadlines.lateCount > 0 ? 'critical' : 'default'}
        />
        <StatTile
          label="Recorded"
          value={formatDuration(d.progress.totalMinutes)}
          sub={`${d.entries.length} entries`}
        />
      </div>

      {/* The record itself */}
      <section className="card stack">
        <div className="card-head">
          <div className="stack-s" style={{ gap: 2 }}>
            <h2>Every week since you started</h2>
            <p className="tiny muted">
              Colour runs from thin to strong — see the key. A dashed outline is a week with
              nothing on it at all.
            </p>
          </div>
          <Link href="/weeks" className="btn btn-sm no-print">All weeks</Link>
        </div>
        <WeekHeatmap
          weeks={d.scores.map((s) => ({
            weekId: s.weekId,
            score: s.score,
            minutes: s.minutes,
            entryCount: s.entryCount,
          }))}
          today={thisWeek}
        />
      </section>

      <div className="grid grid-2">
        <section className="card stack">
          <div className="card-head">
            <h2>How the record is holding up</h2>
          </div>
          <ScoreTrend
            points={d.months.map((m) => ({ key: m.monthKey, label: m.label, value: m.averageScore }))}
            suffix=" / 100 average"
          />
        </section>

        <section className="card stack">
          <div className="card-head">
            <div className="stack-s" style={{ gap: 2 }}>
              <h2>Where the holes are</h2>
              <p className="tiny muted">Runs of weeks with nothing recorded.</p>
            </div>
            <Link href="/weeks" className="btn btn-sm no-print">Fill them in</Link>
          </div>
          {d.gaps.length === 0 ? (
            <p className="small dim">
              {hasRecord ? 'No gaps. That is genuinely rare — keep going.' : 'Nothing logged yet.'}
            </p>
          ) : (
            <div className="stack-s">
              {d.gaps.slice(-6).reverse().map((gap) => (
                <div key={gap.from} className="row-wrap" style={{ gap: 8 }}>
                  <Link href={`/weeks/${gap.from}`} className="small" style={{ color: 'var(--accent)' }}>
                    {gap.count === 1 ? formatWeek(gap.from) : `${formatWeek(gap.from)} → ${formatWeek(gap.to)}`}
                  </Link>
                  <span className="spacer" />
                  <span className={`badge ${gap.count >= SHEET_RULES.maxPeriodMonths * 4 ? 'badge-critical' : ''}`}>
                    {gap.count >= 13 && <span aria-hidden="true">⚠ </span>}
                    {gap.count} {gap.count === 1 ? 'week' : 'weeks'}
                  </span>
                </div>
              ))}
              {d.gaps.length > 6 && (
                <p className="tiny muted">…and {d.gaps.length - 6} more earlier.</p>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card stack">
          <div className="card-head">
            <div className="stack-s" style={{ gap: 2 }}>
              <h2>RIBA work stages</h2>
              <p className="tiny muted">Hours recorded against each stage.</p>
            </div>
          </div>
          <CoverageBars
            rows={d.coverage.stages.map((s) => ({
              id: s.id,
              label: s.label,
              value: s.minutes,
              weeks: s.weeks,
              share: s.share,
              meta: s.lastSeen ? `last ${formatDate(s.lastSeen)}` : null,
            }))}
            emptyLabel="never"
          />
        </section>

        <section className="card stack">
          <div className="card-head">
            <div className="stack-s" style={{ gap: 2 }}>
              <h2>Professional Criteria</h2>
              <p className="tiny muted">What Part 3 assesses you against.</p>
            </div>
            <Link href="/coverage" className="btn btn-sm no-print">Detail</Link>
          </div>
          <CoverageBars
            rows={d.coverage.criteria.map((c) => ({
              id: c.id,
              label: c.label,
              value: c.minutes,
              weeks: c.weeks,
              share: c.share,
              meta: c.lastSeen ? `last ${formatDate(c.lastSeen)}` : null,
            }))}
            emptyLabel="never"
          />
        </section>
      </div>

      {/* Deadlines */}
      {d.deadlines.periods.length > 0 && (
        <section className="card stack">
          <div className="card-head">
            <div className="stack-s" style={{ gap: 2 }}>
              <h2>Record sheets</h2>
              <p className="tiny muted">
                Each covers {SHEET_RULES.maxPeriodMonths} months and is due{' '}
                {SHEET_RULES.submitWithinMonths} months after that period ends.
              </p>
            </div>
            <Link href="/sheets" className="btn btn-sm no-print">Open</Link>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Covers</th>
                  <th>Status</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {d.deadlines.periods.slice(0, 10).map((p) => (
                  <tr key={p.index}>
                    <td>Sheet {p.index}</td>
                    <td className="muted">
                      {formatDate(p.periodStart, { year: false })} – {formatDate(p.periodEnd)}
                    </td>
                    <td>
                      {p.status === 'psa_signed' ? (
                        <span className="badge badge-good"><span aria-hidden="true">✓</span> signed off</span>
                      ) : p.late ? (
                        <span className="badge badge-critical"><span aria-hidden="true">⚠</span> late</span>
                      ) : p.inProgress ? (
                        <span className="badge">in progress</span>
                      ) : (
                        <span className="badge badge-warning"><span aria-hidden="true">◷</span> {p.status === 'not_started' ? 'not started' : p.status.replace('_', ' ')}</span>
                      )}
                    </td>
                    <td className="muted small">{describeWindow(p)}</td>
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

function Headline({
  deadlineNote,
  coverageNote,
  thisWeekLogged,
  unverified,
}: {
  deadlineNote: string | null
  coverageNote: string | null
  thisWeekLogged: boolean
  unverified: number
}) {
  // One message, in priority order. A dashboard that shouts five things at once
  // gets ignored, so it says the most expensive one and stops.
  if (deadlineNote) {
    return (
      <div className="note note-critical">
        <span aria-hidden="true">⚠</span>
        <span><strong>Deadline.</strong> {deadlineNote} <Link href="/sheets" style={{ color: 'var(--accent)' }}>Open sheets</Link></span>
      </div>
    )
  }
  if (unverified > 0) {
    return (
      <div className="note note-warning">
        <span aria-hidden="true">◷</span>
        <span>
          <strong>{unverified}</strong> {unverified === 1 ? 'entry needs' : 'entries need'} a look before
          they count as checked. <Link href="/review" style={{ color: 'var(--accent)' }}>Review them</Link>
        </span>
      </div>
    )
  }
  if (!thisWeekLogged) {
    return (
      <div className="note note-accent">
        <span aria-hidden="true">→</span>
        <span>
          <strong>Nothing logged this week yet.</strong> Two minutes now is an hour saved at the end
          of the quarter. <Link href="/dump" style={{ color: 'var(--accent)' }}>Dump it</Link>
        </span>
      </div>
    )
  }
  if (coverageNote) {
    return (
      <div className="note">
        <span aria-hidden="true">◆</span>
        <span><strong>Worth knowing.</strong> {coverageNote} <Link href="/coverage" style={{ color: 'var(--accent)' }}>See coverage</Link></span>
      </div>
    )
  }
  return (
    <div className="note">
      <span aria-hidden="true">✓</span>
      <span>Nothing needs your attention. The record is in good shape.</span>
    </div>
  )
}

function greeting(name: string): string {
  const first = name.trim().split(/\s+/)[0]
  return first ? `Hello, ${first}` : 'Your record'
}
