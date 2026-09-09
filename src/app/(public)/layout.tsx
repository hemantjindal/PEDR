import Link from 'next/link'

/**
 * The pages somebody can read before they have an account.
 *
 * Everything else in this app assumes a record. These three do not, because
 * the people who most need this arrive with no record, no idea what a PEDR
 * looks like, and a quiet suspicion that they are in trouble. Making them
 * sign up before answering any of that is how you lose them.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar no-print">
        <div className="wrap topbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">P</span>
            <span>PEDR</span>
          </Link>
          <nav className="nav nav-public" aria-label="Guides">
            <Link href="/guides">Guides</Link>
            <Link href="/what-is-a-pedr">A real sheet</Link>
            <Link href="/behind">Am I in trouble?</Link>
          </nav>
          <span className="spacer" />
          <Link href="/sign-in" className="btn btn-ghost btn-sm">Sign in</Link>
        </div>
      </header>

      <main className="wrap" style={{ flex: 1, paddingBlock: 28 }}>{children}</main>

      <footer className="wrap no-print" style={{ paddingBlock: 24 }}>
        <p className="tiny faint">
          Not the official record. RIBA&rsquo;s system at register.architecture.com/pedr is, and
          that is where your mentor and PSA sign. This is the diary that makes filling it in take
          twenty minutes instead of a weekend.
        </p>
      </footer>
    </div>
  )
}
