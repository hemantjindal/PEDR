import Link from 'next/link'
import { FAQ, GLOSSARY, ONBOARDING, WRITING_GUIDE } from '@/lib/pedr/guidance'
import { EXPERIENCE_CATEGORIES, REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'

export const metadata = { title: 'Guide · PEDR' }

export default function GuidePage() {
  return (
    <div className="stack-l">
      <div className="stack-s">
        <h1>The guide</h1>
        <p className="dim">
          Written for someone who has just been told to &ldquo;do their PEDRs&rdquo; and has no idea
          what that means. Nothing here is a substitute for RIBA&rsquo;s own guidance or your PSA —
          it is the version that fits in your head.
        </p>
      </div>

      <section className="card stack">
        <h2>In one paragraph</h2>
        <p className="dim">
          Before you can sit Part 3 and register as an architect you need{' '}
          <strong>{REQUIREMENTS.minTotalMonths} months</strong> of practical experience, recorded in{' '}
          <strong>{SHEET_RULES.requiredSheets} quarterly record sheets</strong> on RIBA&rsquo;s system
          at pedr.co.uk. Each sheet is written by you, discussed and signed by an{' '}
          <strong>Employment Mentor</strong> in your practice, then reviewed and approved by a{' '}
          <strong>Professional Studies Advisor</strong> at a school of architecture. At least{' '}
          {REQUIREMENTS.minRecentMonths} of those months must fall in the{' '}
          {REQUIREMENTS.recentWindowMonths} months immediately before the exam.
        </p>
      </section>

      <section className="card stack" style={{ borderColor: 'color-mix(in srgb, var(--critical) 35%, transparent)' }}>
        <h2>The deadline nobody tells you clearly</h2>
        <p className="dim">
          A sheet covers up to <strong>{SHEET_RULES.maxPeriodMonths} months</strong> and must be
          completed <strong>no later than {SHEET_RULES.submitWithinMonths} months after that period
          ends</strong>. Miss it and the sheet is late. Two things follow: your PSA can no longer
          give you useful feedback on experience that is now half a year old, and a pattern of late
          sheets reads as poor time management at the exam — where it is a number someone can count.
        </p>
        <p className="dim small">
          Your PSA then aims to turn a sheet around in about {SHEET_RULES.psaTargetDays} days. Waits
          of three months are widely reported, and nothing chases them for you, so this app shows
          how long a sheet has been sitting with each person.
        </p>
      </section>

      <section className="stack">
        <h2>Your first hour</h2>
        <div className="stack-s">
          {ONBOARDING.map((step, i) => (
            <div className="card stack-s" key={step.id}>
              <div className="row-wrap">
                <h3>{i + 1}. {step.title}</h3>
                <span className="spacer" />
                <span className="badge">{step.minutes} min</span>
              </div>
              <p className="small dim">{step.why}</p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: 'var(--ink-2)' }}>
                {step.actions.map((action) => <li key={action}>{action}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>What good writing looks like</h2>
        <p className="dim small">
          The most common weakness is describing rather than reflecting. &ldquo;Be more
          reflective&rdquo; is useless advice, so here are the two versions side by side.
        </p>
        <div className="stack-s">
          {WRITING_GUIDE.map((guide) => (
            <div className="card stack-s" key={guide.promptId}>
              <div className="row-wrap">
                <h3>{guide.heading}</h3>
                <span className="spacer" />
                <span className="badge">{guide.words[0]}–{guide.words[1]} words</span>
              </div>
              <p className="small dim">{guide.aim}</p>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <div className="stack-s" style={{ gap: 4 }}>
                  <span className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Weak
                  </span>
                  <p className="small muted" style={{ fontStyle: 'italic' }}>{guide.weak}</p>
                </div>
                <div className="stack-s" style={{ gap: 4 }}>
                  <span className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--good-ink)' }}>
                    Strong
                  </span>
                  <p className="small dim">{guide.strong}</p>
                </div>
              </div>
              <p className="tiny muted"><strong>Why:</strong> {guide.whyBetter}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>Categories of experience</h2>
        <div className="stack-s">
          {EXPERIENCE_CATEGORIES.map((category) => (
            <div className="card card-tight stack-s" key={category.id}>
              <div className="row-wrap">
                <h3>{category.name}</h3>
                <span className="spacer" />
                {category.countsFully
                  ? <span className="badge badge-good"><span aria-hidden="true">✓</span> counts in full</span>
                  : <span className="badge badge-warning"><span aria-hidden="true">!</span> limited</span>}
              </div>
              <p className="small dim">{category.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>Questions people actually ask</h2>
        <div className="stack-s">
          {FAQ.map((item) => (
            <details className="card card-tight" key={item.q}>
              <summary style={{ cursor: 'pointer', fontWeight: 550 }}>{item.q}</summary>
              <p className="small dim" style={{ marginTop: 10 }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>Glossary</h2>
        <div className="grid grid-2">
          {GLOSSARY.map((item) => (
            <div className="card card-tight stack-s" key={item.term}>
              <div className="stack-s" style={{ gap: 2 }}>
                <h3>{item.term}</h3>
                <p className="tiny muted">{item.short}</p>
              </div>
              <p className="small dim">{item.full}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="small muted">
        Ready? <Link href="/dump" style={{ color: 'var(--accent)' }}>Log this week</Link>. Badly is
        fine — nothing else here matters until something exists.
      </p>
    </div>
  )
}
