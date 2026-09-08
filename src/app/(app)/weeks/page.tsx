import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getDashboard } from '@/lib/data'
import { SCORE_BANDS } from '@/lib/pedr/constants'
import { formatDuration, formatWeek, formatWeekRange } from '@/lib/pedr/week'

export const metadata = { title: 'Weeks · PEDR' }
export const dynamic = 'force-dynamic'

export default async function WeeksPage() {
  const user = await requireUser()
  const d = await getDashboard(user.id, { experienceStart: user.experienceStart })
  const weeks = [...d.scores].reverse()

  const missing = d.scores.filter((s) => s.score === 0).length
  const thin = d.thinWeeks.length

  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>Weeks</h1>
        <p className="dim">
          {d.scores.length} weeks since the record starts · {missing} with nothing on them ·{' '}
          {thin} logged but thin.
        </p>
      </div>

      {missing > 0 && (
        <div className="note note-pending">
          <span aria-hidden="true">◷</span>
          <span>
            The quickest win is the most recent empty week — it is the one you still remember.
          </span>
        </div>
      )}

      <div className="sheet sheet-flush">
        <div className="table-scroll">
          <table className="schedule">
            <thead>
              <tr>
                <th>Week</th>
                <th>Dates</th>
                <th style={{ textAlign: 'right' }}>Score</th>
                <th style={{ textAlign: 'right' }}>Time</th>
                <th>What is missing</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const band = SCORE_BANDS.find((b) => b.id === week.band)
                return (
                  <tr key={week.weekId}>
                    <td>
                      <Link href={`/weeks/${week.weekId}`} style={{ color: 'var(--ink)', fontWeight: 500 }}>
                        {formatWeek(week.weekId)}
                      </Link>
                    </td>
                    <td className="small faint">{formatWeekRange(week.weekId)}</td>
                    <td className="n">
                      <span className={`chip ${week.score === 0 ? 'mark-revision' : week.score >= 85 ? 'mark-signed' : week.score < 60 ? 'mark-pending' : ''}`}>
                        {week.score === 0 ? <><span aria-hidden="true">✕</span> none</> : week.score}
                      </span>
                    </td>
                    <td className="n faint">{week.minutes > 0 ? formatDuration(week.minutes) : '—'}</td>
                    <td className="small faint">
                      {week.score === 0 ? (band?.blurb ?? '') : (week.nextBestAction ?? 'Nothing — this one is solid.')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
