import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RailNav, TabBar, TopNav } from '@/components/nav'
import { OfflineBanner } from '@/components/offline'
import { getUser } from '@/lib/auth'
import { signOutAction } from './actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/sign-in')

  return (
    <div className="app">
      {/* Wide screens get the rail; under 1080px it is the bar and the tabs. */}
      <aside className="rail no-print">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">P</span>
          <span>PEDR</span>
        </Link>

        <RailNav />

        <div className="rail-who">
          <span className="label">Signed in</span>
          <span className="mono" title={user.email}>{user.email}</span>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-ghost btn-sm btn-block">Sign out</button>
        </form>
      </aside>

      <div className="app-main">
        <header className="topbar app-topbar no-print">
          <div className="wrap topbar-inner">
            <Link href="/dashboard" className="brand">
              <span className="brand-mark">P</span>
              <span>PEDR</span>
            </Link>
            <TopNav />
            <span className="spacer" />
            <form action={signOutAction}>
              <button type="submit" className="btn btn-ghost btn-sm" title={user.email}>
                Sign out
              </button>
            </form>
          </div>
        </header>

        <OfflineBanner />

        <main className="app-content">{children}</main>

        <TabBar />
      </div>
    </div>
  )
}
