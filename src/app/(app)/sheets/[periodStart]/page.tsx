import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getEmployments, getEntries, getProjects, getWeekNotes } from '@/lib/data'
import { PROFESSIONAL_CRITERIA, RIBA_STAGES, SHEET_RULES } from '@/lib/pedr/constants'
import { employmentForWeek } from '@/lib/pedr/progress'
import { buildSheet, officeSummary, sheetToMarkdown } from '@/lib/pedr/sheet'
import { addDays, addMonths, formatDate, formatDuration, isDateKey, weekIdOf } from '@/lib/pedr/week'
import { CopyBlock } from '@/components/copy-block'

export const dynamic = 'force-dynamic'

export default async function SheetPage({ params }: { params: Promise<{ periodStart: string }> }) {
  const { periodStart } = await params
  if (!isDateKey(periodStart)) notFound()

  const user = await requireUser()
  const periodEnd = addDays(addMonths(periodStart, SHEET_RULES.maxPeriodMonths), -1)

  const [entries, notes, projects, employments] = await Promise.all([
    getEntries(user.id, { from: periodStart, to: periodEnd }),
    getWeekNotes(user.id),
    getProjects(user.id),
    getEmployments(user.id),
  ])

  const employment = employmentForWeek(weekIdOf(periodStart), employments)
  const content = buildSheet({ periodStart, periodEnd, entries, notes, projects, employment })
  const markdown = sheetToMarkdown(content, {
    candidateName: user.name,
    periodStart,
    periodEnd,
  })
  const office = officeSummary(entries)

  return (
    <div className="stack-l">
      <div className="row-wrap no-print" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="stack-s">
          <h1>{formatDate(periodStart)} – {formatDate(periodEnd)}</h1>
          <p className="dim small">
            {entries.length} entries · {content.general.hoursWorked} hours · {content.general.daysWorked} days
          </p>
        </div>
        <div className="row-wrap">
          <a className="btn" href={`/api/sheets/${periodStart}/export?format=csv`}>Download CSV</a>
          <a className="btn" href={`/api/sheets/${periodStart}/export?format=md`}>Download Markdown</a>
          <Link href="/sheets" className="btn btn-ghost">Back</Link>
        </div>
      </div>

      <div className="note note-ink no-print">
        <span aria-hidden="true">→</span>
        <span>
          A draft built from what you logged. Read it, fix anything thin, then paste it into
          pedr.co.uk. Examiners want around {SHEET_RULES.targetPages} pages — cut anything that does
          not name a project, a task, a person or a judgement.
        </span>
      </div>

      {entries.length === 0 && (
        <div className="note note-pending">
          <span aria-hidden="true">⚠</span>
          <span>
            Nothing recorded in this period, so there is nothing to build a sheet from.{' '}
            <Link href="/dump" style={{ color: 'var(--ink)' }}>Fill it in</Link> — the practice
            timesheet export is the fastest way to reconstruct a quarter honestly.
          </span>
        </div>
      )}

      <section className="sheet stack">
        <h2>General information</h2>
        <div className="table-scroll">
          <table className="schedule">
            <tbody>
              <tr><th style={{ width: 200 }}>Employer</th><td>{content.general.employer || '—'}</td></tr>
              <tr><th>Role</th><td>{content.general.role || '—'}</td></tr>
              <tr><th>Supervisor</th><td>{content.general.supervisorName || '—'}</td></tr>
              <tr><th>Category of experience</th><td>{content.general.category}</td></tr>
              <tr><th>Location</th><td>{content.general.location}</td></tr>
              <tr><th>Days worked</th><td className="num">{content.general.daysWorked}</td></tr>
              <tr><th>Hours recorded</th><td className="num">{content.general.hoursWorked}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet stack">
        <h2>Describe projects</h2>
        {content.projects.length === 0 ? (
          <p className="small faint">No project work recorded in this period.</p>
        ) : (
          <div className="stack">
            {content.projects.map((project) => (
              <div className="stack-s" key={project.projectId ?? project.name}>
                <div className="row-wrap">
                  <h3>{[project.code, project.name].filter(Boolean).join(' · ')}</h3>
                  <span className="spacer" />
                  <span className="chip">{formatDuration(project.minutes)}</span>
                </div>
                <p className="tiny faint">
                  {[
                    project.client && `Client: ${project.client}`,
                    project.valueGbp && `£${project.valueGbp.toLocaleString('en-GB')}`,
                    project.procurement,
                    project.stages.length > 0 && `Stages ${project.stages.join(', ')}`,
                  ].filter(Boolean).join(' · ')}
                </p>
                {project.summary
                  ? <p className="small dim">{project.summary}</p>
                  : <p className="small" style={{ color: 'var(--pending-ink)' }}>
                      <span aria-hidden="true">⚠ </span>
                      Nothing specific enough to summarise. The entries for this project say what
                      but not which — worth a pass before you submit.
                    </p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sheet stack">
        <h2>Record activities — hours by work stage</h2>
        <div className="table-scroll">
          <table className="schedule">
            <thead>
              <tr><th>Stage</th><th></th><th style={{ textAlign: 'right' }}>Hours</th></tr>
            </thead>
            <tbody>
              {RIBA_STAGES.map((s) => {
                const minutes = content.stageMinutes[String(s.id)] ?? 0
                return (
                  <tr key={s.id}>
                    <td className="num">{s.code}</td>
                    <td>{s.name}</td>
                    <td className="n">{minutes > 0 ? (minutes / 60).toFixed(1) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {office.length > 0 && (
        <section className="sheet stack">
          <div className="sheet-head">
            <div className="stack-s" style={{ gap: 2 }}>
              <h2>Office management</h2>
              <p className="tiny faint">
                The section people forget. Holiday is recorded but is absence, not experience.
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="schedule">
              <tbody>
                {office.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="n">{(row.minutes / 60).toFixed(1)}</td>
                    <td className="small faint">{row.counts ? 'counts as experience' : 'absence'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="sheet stack">
        <h2>Professional criteria</h2>
        <div className="stack">
          {PROFESSIONAL_CRITERIA.map((c) => {
            const row = content.criteria[c.id]
            return (
              <div className="stack-s" key={c.id}>
                <div className="row-wrap">
                  <h3>{c.id} · {c.name}</h3>
                  <span className="spacer" />
                  {row && row.entries > 0
                    ? <span className="chip">{row.entries} entries · {formatDuration(row.minutes)}</span>
                    : <span className="mark mark-revision"><span aria-hidden="true">⚠</span> nothing this period</span>}
                </div>
                {row && row.examples.length > 0 && (
                  <ul className="small dim" style={{ margin: 0, paddingLeft: 18 }}>
                    {row.examples.map((example) => <li key={example}>{example}</li>)}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="sheet stack">
        <div className="sheet-head">
          <h2>Reflect on experience</h2>
        </div>
        {([
          ['What did you actually do?', content.reflection.did],
          ['What did you learn?', content.reflection.learned],
          ['What went well?', content.reflection.wentWell],
          ['What went wrong?', content.reflection.wentWrong],
          ['What next?', content.reflection.next],
        ] as const).map(([heading, body]) => (
          <div className="stack-s" key={heading}>
            <h3>{heading}</h3>
            {body.trim() ? (
              <ul className="small dim" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                {body.split('\n').map((line) => <li key={line}>{line}</li>)}
              </ul>
            ) : (
              <p className="small" style={{ color: 'var(--pending-ink)' }}>
                <span aria-hidden="true">⚠ </span>
                Nothing captured. Fill this in on the weeks it belongs to and it appears here.
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="sheet stack no-print">
        <div className="sheet-head">
          <div className="stack-s" style={{ gap: 2 }}>
            <h2>Copy it out</h2>
            <p className="tiny faint">Markdown, in the order of the real sheet&rsquo;s sections.</p>
          </div>
        </div>
        <CopyBlock text={markdown} />
      </section>
    </div>
  )
}
