import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { CatchUpTool } from '@/components/catch-up-tool'
import { SITE, absolute } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Behind on your PEDR? · PEDR',
  description:
    'Your two years of practical experience, drawn as 104 week-squares. Drop your calendar in ' +
    'and watch the ones you never wrote down fill themselves. No account.',
  alternates: { canonical: absolute('/') },
  openGraph: {
    type: 'website',
    url: absolute('/'),
    siteName: SITE.name,
    title: 'Behind on your PEDR? It is already written down.',
    description: 'Your two years as 104 squares. Drop your calendar in and watch them fill.',
  },
}

/**
 * The front door is the tool.
 *
 * It used to be three columns of prose explaining what the tool would do,
 * which is a thing you write when you are frightened the tool is not enough.
 * The register of hollow week-squares says it in one look, and the button
 * under it is the only thing anybody has to understand.
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

      <main className="wrap" style={{ flex: 1, paddingBlock: 34 }}>
        <div className="stack-l">
          <CatchUpTool />
          <div className="strip" style={{ maxWidth: 620, marginInline: 'auto' }}>
            <Link href="/what-is-a-pedr">What a PEDR actually looks like</Link>
            <Link href="/guides">Deadlines, what counts, who signs</Link>
            <Link href="/sign-up">Keep a record</Link>
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
