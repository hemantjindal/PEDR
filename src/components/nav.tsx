'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dump', label: 'Dump' },
  { href: '/weeks', label: 'Weeks' },
  { href: '/coverage', label: 'Coverage' },
  { href: '/sheets', label: 'Sheets' },
  { href: '/guide', label: 'Guide' },
  { href: '/settings', label: 'Settings' },
]

/** The five that matter on a phone. Dump sits in the middle, under a thumb. */
const TABS = [
  { href: '/dashboard', label: 'Home', icon: 'M3 11.5 12 4l9 7.5M6 10v9h12v-9' },
  { href: '/weeks', label: 'Weeks', icon: 'M4 6h16M4 12h16M4 18h10' },
  { href: '/dump', label: 'Dump', icon: 'M12 5v14M5 12h14' },
  { href: '/sheets', label: 'Sheets', icon: 'M7 3h7l5 5v13H7zM14 3v5h5' },
  { href: '/guide', label: 'Guide', icon: 'M12 6.5a5 5 0 1 1 3 9v2m-3 3h.01' },
]

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function TopNav() {
  const pathname = usePathname()
  return (
    <nav className="nav" aria-label="Sections">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

export function TabBar() {
  const pathname = usePathname()
  return (
    <nav className="tabbar no-print" aria-label="Sections">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={isActive(pathname, tab.href) ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={tab.icon} />
          </svg>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
