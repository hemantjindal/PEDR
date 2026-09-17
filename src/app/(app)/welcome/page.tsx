import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { FirstImport } from '@/components/first-import'
import { ONBOARDING } from '@/lib/pedr/guidance'
import { PEDR_SYSTEM, REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'

export const metadata = { title: 'Welcome · PEDR' }

export default async function WelcomePage() {
  const user = await requireUser()
  const first = user.name.trim().split(/\s+/)[0]

  const total = ONBOARDING.reduce((sum, step) => sum + step.minutes, 0)

  return (
    <div className="stack-l">
      <div className="page-head">
        <div>
          <span className="label">Your record</span>
          <h1>Welcome{first ? `, ${first}` : ''}</h1>
          <p>
            Log a week in three lines. The {SHEET_RULES.requiredSheets} sheets build themselves
            out of what you log.
          </p>
        </div>
        <div className="page-head-actions">
          <Link href="/dump" className="btn btn-primary">Log this week</Link>
          <Link href="/catch-up" className="btn">Catch up on old weeks</Link>
        </div>
      </div>

      <FirstImport />

      <div className="split">
        <section className="stack">
          <div className="stack-s">
            <span className="label">{total} minutes, once</span>
            <h2>Set it up properly</h2>
            <p className="small dim" style={{ maxWidth: '58ch' }}>
              None of this is urgent today. All of it is expensive to fix a year in, which is the
              only reason it is here first.
            </p>
          </div>

          <ol className="route">
            {ONBOARDING.map((step, i) => (
              <li key={step.id}>
                <span className="route-n" aria-hidden="true">{i + 1}</span>
                <div className="route-body">
                  <div className="route-top">
                    <h3>{step.title}</h3>
                    <span className="spacer" />
                    <span className="ref">{step.minutes} min</span>
                  </div>
                  <p className="route-why">{step.why}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="row-wrap">
            <Link href="/start" className="btn">Start with step one</Link>
            <Link href="/settings" className="btn btn-ghost">Open settings</Link>
          </div>
        </section>

        <aside className="stack">
          <section className="sheet stack">
            <div className="sheet-head">
              <div>
                <span className="label">The requirement</span>
                <h2 style={{ marginTop: 3 }}>What you are working towards</h2>
              </div>
            </div>
            <dl className="facts-rows">
              <div>
                <dt>Practical experience</dt>
                <dd>{REQUIREMENTS.minTotalMonths} months</dd>
              </div>
              <div>
                <dt>Record sheets</dt>
                <dd>{SHEET_RULES.requiredSheets}</dd>
              </div>
              <div>
                <dt>Each sheet covers</dt>
                <dd>{SHEET_RULES.maxPeriodMonths} months</dd>
              </div>
              <div>
                <dt>Sheet due after that</dt>
                <dd>{SHEET_RULES.submitWithinMonths} months</dd>
              </div>
              <div>
                <dt>Must be recent</dt>
                <dd>{REQUIREMENTS.minRecentMonths} of {REQUIREMENTS.recentWindowMonths}</dd>
              </div>
            </dl>
            <p className="tiny faint">
              Every sheet is signed by your mentor and approved by your PSA. The{' '}
              {SHEET_RULES.submitWithinMonths}-month deadline is the one nobody tells you about
              until you have missed it.
            </p>
          </section>

          <section className="sheet sheet-tight stack-s">
            <span className="label">Worth knowing</span>
            <p className="small dim">
              This is not the official record. RIBA&rsquo;s system at {PEDR_SYSTEM.shortUrl} is,
              and that is where your mentor and PSA sign. This is the thing that makes filling it
              in take twenty minutes instead of a weekend.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
