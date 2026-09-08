import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TabBar, TopNav } from '@/components/nav'
import { getUser } from '@/lib/auth'
import { signOutAction } from './actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/sign-in')

  return (
    <div className="shell">
      <header className="topbar no-print">
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

      <main className="wrap" style={{ flex: 1, paddingBlock: 24 }}>
        {children}
      </main>

      <TabBar />
    </div>
  )
}
