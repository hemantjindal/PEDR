import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { FirstImport } from '@/components/first-import'
import { ONBOARDING } from '@/lib/pedr/guidance'
import { REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'

export const metadata = { title: 'Welcome · PEDR' }

export default async function WelcomePage() {
  const user = await requireUser()
  const first = user.name.trim().split(/\s+/)[0]

  return (
    <div className="stack-l" style={{ maxWidth: 720 }}>
      <div className="stack-s">
        <h1>Welcome{first ? `, ${first}` : ''}</h1>
        <p className="dim">
          Your record starts here. Log a week in three lines and the sheets build themselves.
        </p>
      </div>

      <FirstImport />

      <div className="row-wrap">
        <Link href="/review" className="btn btn-primary">Check your entries</Link>
        <Link href="/dump" className="btn">Log this week</Link>
        <Link href="/start" className="btn btn-ghost">Set up your record</Link>
      </div>

      <section className="sheet stack">
        <h2>What you are actually working towards</h2>
        <p className="dim small">
          {REQUIREMENTS.minTotalMonths} months of practical experience, recorded across{' '}
          {SHEET_RULES.requiredSheets} quarterly sheets, each signed by a mentor in your practice and
          approved by a Professional Studies Advisor. Each sheet is due{' '}
          {SHEET_RULES.submitWithinMonths} months after the quarter it covers ends — the deadline
          that quietly catches people out, and the one this app keeps in front of you.
        </p>
      </section>

      <section className="stack">
        <h2>Setting up properly, when you have twenty minutes</h2>
        <div className="stack-s">
          {ONBOARDING.map((step, i) => (
            <div className="sheet sheet-tight stack-s" key={step.id}>
              <div className="row-wrap">
                <h3>{i + 1}. {step.title}</h3>
                <span className="spacer" />
                <span className="chip">{step.minutes} min</span>
              </div>
              <p className="small dim">{step.why}</p>
            </div>
          ))}
        </div>
        <div className="row-wrap">
          <Link href="/settings" className="btn">Open settings</Link>
          <Link href="/projects" className="btn">Add your projects</Link>
        </div>
      </section>

      <p className="small faint">
        This is not the official record. RIBA&rsquo;s system at register.architecture.com/pedr is, and that is where your
        mentor and PSA sign. This is the thing that makes filling it in take twenty minutes instead
        of a weekend.
      </p>
    </div>
  )
}
