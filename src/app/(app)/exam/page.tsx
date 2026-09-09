import Link from 'next/link'
import { ExamPanel } from '@/components/examiner'
import { requireUser } from '@/lib/auth'
import { getDashboard } from '@/lib/data'
import { PROFESSIONAL_CRITERIA } from '@/lib/pedr/constants'

export const metadata = { title: 'The viva · PEDR' }
export const dynamic = 'force-dynamic'

export default async function ExamPage() {
  const user = await requireUser()
  const d = await getDashboard(user.id, { experienceStart: user.experienceStart })
  const exam = d.exam

  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>What they would ask you</h1>
        <p className="dim">
          Part 3 ends in an oral exam, and the examiners have read your record. They ask about what
          is on the page. Nobody fails for a gap they declared — people fail for a claim they
          cannot defend.
        </p>
      </div>

      {exam.exposed > 0 && exam.worst && (
        <div className="note note-revision">
          <span aria-hidden="true">⚠</span>
          <span>
            <strong>The one to fix first:</strong> {exam.worst.question}
          </span>
        </div>
      )}

      <section className="sheet stack-s no-print">
        <div className="sheet-head">
          <div className="stack-s" style={{ gap: 2 }}>
            <h2>By criterion</h2>
            <p className="tiny faint">
              How a PSA reads it: not how much you have logged, but how much of it you could stand
              behind in a room.
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="schedule schedule-wide">
            <thead>
              <tr>
                <th></th><th></th>
                <th style={{ textAlign: 'right' }}>Answerable</th>
                <th style={{ textAlign: 'right' }}>Thin</th>
                <th style={{ textAlign: 'right' }}>Exposed</th>
              </tr>
            </thead>
            <tbody>
              {PROFESSIONAL_CRITERIA.map((criterion) => {
                const row = exam.byCriterion[criterion.id] ?? { answerable: 0, thin: 0, exposed: 0 }
                return (
                  <tr key={criterion.id}>
                    <td className="num">{criterion.id}</td>
                    <td>{criterion.plainly}</td>
                    <td className="n">{row.answerable || '—'}</td>
                    <td className="n">{row.thin || '—'}</td>
                    <td className="n" style={row.exposed > 0 ? { color: 'var(--alarm-text)' } : undefined}>
                      {row.exposed || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ExamPanel report={exam} />

      <p className="tiny faint">
        These are generated from your own entries — the quotes are yours. They are a rehearsal, not
        a prediction: real examiners will ask their own questions, and they will follow up. What
        this can tell you is which of them you have nothing to say to.{' '}
        <Link href="/coverage" style={{ fontWeight: 500 }}>See where the record is thin →</Link>
      </p>
    </div>
  )
}
