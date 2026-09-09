import Link from 'next/link'
import type { ExamQuestion, ExamReport, Verdict } from '@/lib/pedr/examiner'
import { formatDate } from '@/lib/pedr/week'

/**
 * The viva, run against your own record.
 *
 * The design job here is to make one distinction impossible to miss, because
 * it is the whole point: a gap you have declared is fine, and a claim you
 * cannot defend is not. So *exposed* is alarm red and sits at the top, and
 * everything answerable is deliberately quiet — reassurance is not what
 * anybody came to this screen for.
 */

const VERDICT: Record<Verdict, { mark: string; label: string; blurb: string }> = {
  exposed: {
    mark: 'mark-revision',
    label: 'exposed',
    blurb: 'Your record invites this and cannot answer it.',
  },
  thin: {
    mark: 'mark-pending',
    label: 'thin',
    blurb: 'Something is there, but vague, watched, or theory rather than a job.',
  },
  answerable: {
    mark: 'mark-signed',
    label: 'answerable',
    blurb: 'Specific work you did yourself sits behind it.',
  },
}

export function ExamPanel({
  report,
  limit,
  href = '/exam',
}: {
  report: ExamReport
  /** Show the worst few on a dashboard; everything on its own page. */
  limit?: number
  href?: string
}) {
  const shown = limit ? report.questions.slice(0, limit) : report.questions
  const pct = Math.round(report.readiness * 100)

  return (
    <section className="sheet stack">
      <div className="sheet-head">
        <div>
          <span className="label">If you sat it tomorrow</span>
          <h2 style={{ marginTop: 3 }}>What they would ask you</h2>
        </div>
        <span className="spacer" />
        <span className={`chip ${report.exposed > 0 ? 'chip-revision' : 'chip-ink'}`}>
          {pct}% defensible
        </span>
      </div>

      <p className="small dim">{report.headline}</p>

      {/* Three counts, and the order is the point: the bad news first. */}
      <div className="titleblock">
        <div>
          <span className="label">Exposed</span>
          <span className="value">{report.exposed}</span>
        </div>
        <div>
          <span className="label">Thin</span>
          <span className="value">{report.thin}</span>
        </div>
        <div>
          <span className="label">Answerable</span>
          <span className="value">{report.answerable}</span>
        </div>
        <div>
          <span className="label">Questions</span>
          <span className="value">{report.questions.length}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map((question, i) => (
          <QuestionRow key={question.id} question={question} first={i === 0} />
        ))}
      </div>

      {limit && report.questions.length > limit && (
        <Link href={href} className="btn">
          All {report.questions.length} questions
        </Link>
      )}
    </section>
  )
}

function QuestionRow({ question, first }: { question: ExamQuestion; first: boolean }) {
  const verdict = VERDICT[question.verdict]
  return (
    <div
      style={{
        padding: '14px 0',
        borderTop: first ? 'none' : '1px solid var(--hair)',
      }}
    >
      <div className="row-wrap" style={{ gap: 8, alignItems: 'baseline', marginBottom: 5 }}>
        <span className={`mark ${verdict.mark}`}>{verdict.label}</span>
        {question.criterion && <span className="label">{question.criterion}</span>}
        {question.stage !== null && <span className="label">Stage {question.stage}</span>}
      </div>

      {/* The question in the candidate's face, at reading size, because this is
          the sentence they will hear. */}
      <p style={{ fontWeight: 600, lineHeight: 1.4 }}>{question.question}</p>

      <p className="tiny faint" style={{ marginTop: 5 }}>{question.because}</p>

      {question.evidence.quote && (
        <p
          className="small"
          style={{
            marginTop: 8,
            paddingLeft: 10,
            borderLeft: '2px solid var(--hair)',
            color: 'var(--ink-2)',
          }}
        >
          “{question.evidence.quote}”
          {question.evidence.date && (
            <span className="tiny faint"> — your record, {formatDate(question.evidence.date)}</span>
          )}
        </p>
      )}

      <details style={{ marginTop: 8 }}>
        <summary className="small dim" style={{ cursor: 'pointer' }}>
          What a good answer has in it
        </summary>
        <ul className="small dim" style={{ margin: '8px 0 0', paddingLeft: 18, listStyleType: 'disc' }}>
          {question.looksFor.map((point) => <li key={point}>{point}</li>)}
        </ul>
      </details>

      {question.fix && (
        <p className="note note-pending small" style={{ marginTop: 10 }}>
          <span aria-hidden="true">→</span> <span>{question.fix}</span>
        </p>
      )}
    </div>
  )
}
