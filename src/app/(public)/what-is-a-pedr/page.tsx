import Link from 'next/link'
import { buildSheet } from '@/lib/pedr/sheet'
import { buildDemoRecord } from '@/lib/demo-record'
import {
  EXPERIENCE_CATEGORIES, PARTICIPATION, PROFESSIONAL_CRITERIA, REQUIREMENTS, RIBA_STAGES,
  SHEET_RULES,
} from '@/lib/pedr/constants'
import { WRITING_GUIDE } from '@/lib/pedr/guidance'
import { addDays, addMonths, formatDate, formatDuration, todayKey } from '@/lib/pedr/week'

export const metadata = {
  title: 'What a PEDR actually looks like · PEDR',
  description:
    'A real quarterly record sheet, filled in, with every section explained and the weak version ' +
    'and the strong version of each box side by side. No account needed.',
}

/**
 * The page nobody gets shown.
 *
 * You are told to keep a PEDR for two years before anybody puts a finished one
 * in front of you, which is most of the reason people put it off: it is hard
 * to start a document you have never seen. So this is one, built from the same
 * generator the app uses, with the sections named, the traps marked, and the
 * weak-versus-strong pairs that make "be more reflective" mean something.
 */
export default function WhatIsAPedrPage() {
  const today = todayKey()
  const record = buildDemoRecord({ today })
  const periodStart = addMonths(today, -4)
  const periodEnd = addDays(addMonths(periodStart, SHEET_RULES.maxPeriodMonths), -1)
  const content = buildSheet({
    periodStart,
    periodEnd,
    entries: record.entries,
    notes: record.notes,
    projects: record.projects,
    employment: record.employment,
  })

  return (
    <div className="stack-l" style={{ maxWidth: 780 }}>
      <div className="stack-s">
        <span className="label">Nobody shows you one until you have to write it</span>
        <h1>What a PEDR actually looks like</h1>
        <p className="dim">
          This is a real quarterly record sheet, filled in. There are{' '}
          {SHEET_RULES.requiredSheets} of them across {REQUIREMENTS.minTotalMonths} months, each
          one covering up to {SHEET_RULES.maxPeriodMonths} months, each signed by somebody in your
          practice and approved by a Professional Studies Advisor.
        </p>
      </div>

      <div className="note note-pending">
        <span aria-hidden="true">→</span>
        <span>
          <strong>The deadline nobody mentions:</strong> a sheet has to be completed within{' '}
          {SHEET_RULES.submitWithinMonths} months of the end of the period it covers. Not by the
          exam — {SHEET_RULES.submitWithinMonths} months. That is the rule almost everybody
          discovers by breaking it.
        </span>
      </div>

      {/* --- The sheet, section by section ---------------------------------- */}

      <Section
        n={1}
        title="General information"
        note="Who you are, who you work for, and who is responsible for you. Boring, and the first thing a PSA checks — category i experience has to be supervised by a registered architect, and their registration number goes on every sheet."
      >
        <div className="table-scroll">
          <table className="schedule">
            <tbody>
              <tr><th style={{ width: 190 }}>Employer</th><td>{content.general.employer}</td></tr>
              <tr><th>Role</th><td>{content.general.role}</td></tr>
              <tr><th>Employment supervisor</th><td>{content.general.supervisorName}</td></tr>
              <tr>
                <th>Category of experience</th>
                <td>
                  {content.general.category} —{' '}
                  {EXPERIENCE_CATEGORIES.find((c) => c.id === content.general.category)?.blurb}
                </td>
              </tr>
              <tr><th>Days worked</th><td className="num">{content.general.daysWorked}</td></tr>
              <tr><th>Hours recorded</th><td className="num">{content.general.hoursWorked}</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        n={2}
        title="Describe your projects"
        note="A short paragraph per job: what it is, how it is procured, what you did on it. Sheets are assessed per project, so hours with no job attached are hard to defend."
      >
        <div className="stack-s">
          {content.projects.slice(0, 2).map((project) => (
            <div className="sheet sheet-tight stack-s" key={project.code || project.name}>
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
              <p className="small dim">{project.summary}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        n={3}
        title="Record your activities"
        note="Hours against each RIBA work stage — in two columns, which is the part most people miss. Participant is work you did. Observer is work you watched or were taught. Both count, and the shift from the second to the first over two years is the clearest evidence of development you will ever have."
      >
        <div className="table-scroll">
          <table className="schedule schedule-wide">
            <thead>
              <tr>
                <th>Stage</th><th></th>
                <th style={{ textAlign: 'right' }}>Participant</th>
                <th style={{ textAlign: 'right' }}>Observer</th>
              </tr>
            </thead>
            <tbody>
              {RIBA_STAGES.map((stage) => {
                const split = content.stageParticipation[String(stage.id)]
                  ?? { participant: 0, observer: 0 }
                const cell = (m: number) => (m > 0 ? (m / 60).toFixed(1) : '—')
                return (
                  <tr key={stage.id}>
                    <td className="num">{stage.code}</td>
                    <td>{stage.name}</td>
                    <td className="n">{cell(split.participant)}</td>
                    <td className="n">{cell(split.observer)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="row-wrap" style={{ gap: 5, marginTop: 10 }}>
          {PARTICIPATION.map((p) => (
            <span className="chip" key={p.id} title={p.plainly}>{p.name} — {p.blurb}</span>
          ))}
        </div>
      </Section>

      <Section
        n={4}
        title="Professional Criteria"
        note="The five things Part 3 is actually about. Your entries get tagged against them, and an examiner will ask you about any one of them whether or not you have anything against it."
      >
        <div className="stack-s">
          {PROFESSIONAL_CRITERIA.map((criterion) => (
            <div className="check-row" key={criterion.id}>
              <span className="check-label small">
                <strong>{criterion.id}</strong> — {criterion.name}
                <br />
                <span className="tiny faint">{criterion.plainly}</span>
              </span>
              <span className="check-value">
                <span className="ref">{content.criteria[criterion.id]?.entries ?? 0} entries</span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        n={5}
        title="Reflect on your experience"
        note="Five boxes, and the only part an examiner reads closely. This is where every PEDR is won or lost, and it is why a week where nothing went wrong scores badly — you have nothing to write here."
      >
        <div className="stack">
          {WRITING_GUIDE.map((guide) => (
            <div className="sheet sheet-tight stack-s" key={guide.promptId}>
              <div className="row-wrap">
                <h3>{guide.heading}</h3>
                <span className="spacer" />
                <span className="chip">{guide.words[0]}–{guide.words[1]} words</span>
              </div>
              <p className="tiny faint">{guide.aim}</p>

              <div className="grid grid-2">
                <div className="stack-s">
                  <span className="mark mark-revision">what most people write</span>
                  <p className="small dim">{guide.weak}</p>
                </div>
                <div className="stack-s">
                  <span className="mark mark-signed">what gets you through</span>
                  <p className="small">{guide.strong}</p>
                </div>
              </div>

              <p className="tiny faint">{guide.whyBetter}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        n={6}
        title="The appraisal"
        note="Your employment supervisor and your PSA each write a short assessment and sign it. This part is not completed online — RIBA gives you a template to fill in and upload, which is why most mentors end up writing it from memory in a blank box."
      />

      <section className="sheet stack">
        <div className="sheet-head">
          <div>
            <span className="label">Now the useful part</span>
            <h2 style={{ marginTop: 3 }}>You do not write this from memory</h2>
          </div>
        </div>
        <p className="small dim">
          Every figure above was generated from a diary of one-line entries — the sort of thing you
          type on a Friday afternoon, or that gets pulled out of your calendar and your practice
          timesheet automatically. Nobody sits down and writes one of these from a blank page, and
          the people who try are the ones who are still trying in month twenty-two.
        </p>
        <div className="row-wrap">
          <Link href="/sign-up" className="btn btn-primary">Start one</Link>
          <Link href="/behind" className="btn">First — how far behind am I?</Link>
        </div>
      </section>
    </div>
  )
}

function Section({
  n,
  title,
  note,
  children,
}: {
  n: number
  title: string
  note: string
  children?: React.ReactNode
}) {
  return (
    <section className="stack">
      <div className="stack-s">
        <span className="label">Section {n}</span>
        <h2>{title}</h2>
        <p className="small dim" style={{ maxWidth: '62ch' }}>{note}</p>
      </div>
      {children}
    </section>
  )
}
