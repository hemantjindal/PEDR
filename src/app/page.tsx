import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'
import { SITE, absolute } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Months behind on your PEDR? · PEDR',
  description:
    'Almost nobody keeps a PEDR up to date. The record you are missing is already in your ' +
    'calendar and your practice timesheet — this pulls it back out, week by week.',
  alternates: { canonical: absolute('/') },
  openGraph: {
    type: 'website',
    url: absolute('/'),
    siteName: SITE.name,
    title: 'Months behind on your PEDR? It is already written down.',
    description: SITE.description,
  },
}

/**
 * The front door.
 *
 * Three doors, because there are three people who arrive here and they are in
 * very different states. One is months behind and has been avoiding it. One is
 * frightened and wants to know how bad it is. One has never seen a PEDR and
 * does not know what the thing even looks like.
 *
 * None of them wants to hear about streaks. The old landing page redirected
 * straight to a sign-in form, which asks all three of them to commit before
 * anything has been answered.
 */
export default async function Root() {
  const user = await getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="shell">
      <header className="topbar no-print">
        <div className="wrap topbar-inner">
          <span className="brand">
            <span className="brand-mark">P</span>
            <span>PEDR</span>
          </span>
          <span className="spacer" />
          <Link href="/sign-in" className="btn btn-ghost btn-sm">Sign in</Link>
        </div>
      </header>

      <main className="wrap" style={{ flex: 1, paddingBlock: 32 }}>
        <div className="stack-l" style={{ maxWidth: 760 }}>
          <div className="stack-s">
            <span className="label">For anyone doing Part 3</span>
            <h1 style={{ fontSize: 'clamp(1.9rem, 6vw, 3rem)', lineHeight: 1.05 }}>
              Months behind on your PEDR?
              <br />
              It is already written down.
            </h1>
            <p className="dim" style={{ maxWidth: '58ch' }}>
              Almost nobody keeps a PEDR up to date. The record you are missing is sitting in your
              Outlook calendar and your practice timesheet — this pulls it back out, week by week,
              and tells you which weeks it could not reach.
            </p>
          </div>

          <div className="row-wrap">
            <Link href="/behind" className="btn btn-primary">Find out how bad it is</Link>
            <Link href="/what-is-a-pedr" className="btn">Show me what a PEDR looks like</Link>
            <Link href="/guides" className="btn btn-ghost">Just answer my question</Link>
          </div>

          {/* The three states somebody arrives in. */}
          <div className="grid grid-3">
            {[
              {
                title: 'Stuck on it',
                body:
                  'Eight months of blank weeks and no idea where to start. Point it at your ' +
                  'calendar and your timesheet and it reconstructs the period — the dates, the ' +
                  'jobs, the meetings, and who was in them.',
                cta: 'Catch up',
                href: '/behind',
              },
              {
                title: 'Afraid of it',
                body:
                  'You have been avoiding it and it has grown. Sixty seconds, no account: how ' +
                  'many sheets are actually late, whether the time is recoverable, and what ' +
                  'happens now. The answer is nearly always better than the thing you imagined.',
                cta: 'Am I in trouble?',
                href: '/behind',
              },
              {
                title: 'Never seen one',
                body:
                  'Nobody shows you a finished PEDR before you have to write one. Here is a real ' +
                  'quarterly sheet, filled in, with the weak version and the strong version of ' +
                  'every box side by side.',
                cta: 'See a filled-in sheet',
                href: '/what-is-a-pedr',
              },
            ].map((door) => (
              <section className="sheet stack-s" key={door.title}>
                <h2>{door.title}</h2>
                <p className="small dim" style={{ flex: 1 }}>{door.body}</p>
                <Link href={door.href} className="btn btn-sm">{door.cta}</Link>
              </section>
            ))}
          </div>

          <section className="sheet stack-s">
            <div className="sheet-head">
              <div>
                <span className="label">The bit nobody tells you</span>
                <h2 style={{ marginTop: 3 }}>The deadline is not the exam</h2>
              </div>
            </div>
            <p className="small dim">
              A record sheet covers up to {SHEET_RULES.maxPeriodMonths} months and has to be
              completed within <strong style={{ color: 'var(--ink)' }}>
              {SHEET_RULES.submitWithinMonths} months of the end of the period it covers</strong>.
              Miss it and the sheet is late — your PSA can no longer give you feedback worth
              having, and a run of late sheets is a number an examiner can count. Nothing in the
              official system puts that in front of you.
            </p>
            <p className="small dim">
              You need {REQUIREMENTS.minTotalMonths} months across{' '}
              {SHEET_RULES.requiredSheets} sheets, and{' '}
              {REQUIREMENTS.minRecentMonths} of those months have to fall in the{' '}
              {REQUIREMENTS.recentWindowMonths} months immediately before you sit.
            </p>
          </section>

          <div className="row-wrap">
            <Link href="/sign-up" className="btn btn-primary">Start a record</Link>
            <Link href="/sign-in" className="btn">I already have one</Link>
            <Link href="/guides" className="btn btn-ghost">Read the guides first</Link>
          </div>
        </div>
      </main>

      <footer className="wrap no-print" style={{ paddingBlock: 24 }}>
        <p className="tiny faint">
          Not the official record. RIBA&rsquo;s system at register.architecture.com/pedr is, and
          that is where your mentor and PSA sign.
        </p>
      </footer>
    </div>
  )
}
