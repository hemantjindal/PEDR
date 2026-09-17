'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Item {
  href: string
  label: string
  icon: string
}

/**
 * The sections, in three groups.
 *
 * Ten links in a row across the top is a list of things to skip past. The
 * grouping is the actual answer to "where am I supposed to start": you record,
 * you catch up what you did not record, you check it before anyone else does.
 */
const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: 'Record',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'M3 11.5 12 4l9 7.5M6 10v9h12v-9' },
      { href: '/dump', label: 'Dump', icon: 'M12 5v14M5 12h14' },
      { href: '/weeks', label: 'Weeks', icon: 'M4 6h16M4 12h16M4 18h10' },
    ],
  },
  {
    title: 'Catch up',
    items: [
      { href: '/catch-up', label: 'Catch up', icon: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5' },
      { href: '/calendar', label: 'Calendar', icon: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4' },
    ],
  },
  {
    title: 'Check',
    items: [
      { href: '/coverage', label: 'Coverage', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
      { href: '/exam', label: 'Viva', icon: 'M12 6.5a5 5 0 1 1 3 9v2m-3 3h.01' },
      { href: '/sheets', label: 'Sheets', icon: 'M7 3h7l5 5v13H7zM14 3v5h5' },
    ],
  },
]

const FOOT: Item[] = [
  { href: '/guide', label: 'Guide', icon: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3zM5 4v19' },
  { href: '/settings', label: 'Settings', icon: 'M4 7h10M18 7h2M4 17h4M12 17h8M15 4v6M9 14v6' },
]

/** Everything, flat — the narrow top bar and the demo both want one list. */
const ITEMS: Item[] = [...GROUPS.flatMap((g) => g.items), ...FOOT]

/** The six that matter on a phone. Dump sits in the middle, under a thumb. */
const TABS = [
  { href: '/dashboard', label: 'Home', icon: 'M3 11.5 12 4l9 7.5M6 10v9h12v-9' },
  { href: '/weeks', label: 'Weeks', icon: 'M4 6h16M4 12h16M4 18h10' },
  { href: '/dump', label: 'Dump', icon: 'M12 5v14M5 12h14' },
  { href: '/catch-up', label: 'Catch up', icon: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5' },
  { href: '/exam', label: 'Viva', icon: 'M12 6.5a5 5 0 1 1 3 9v2m-3 3h.01' },
  { href: '/sheets', label: 'Sheets', icon: 'M7 3h7l5 5v13H7zM14 3v5h5' },
]

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function Glyph({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
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

/** The desktop rail. Hidden under 1080px, where the top bar takes over. */
export function RailNav() {
  const pathname = usePathname()
  return (
    <nav className="rail-nav" aria-label="Sections">
      {GROUPS.map((group) => (
        <div className="rail-group" key={group.title}>
          <span className="label">{group.title}</span>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            >
              <Glyph d={item.icon} />
              {item.label}
            </Link>
          ))}
        </div>
      ))}
      <div className="rail-foot">
        {FOOT.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
          >
            <Glyph d={item.icon} />
            {item.label}
          </Link>
        ))}
      </div>
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
          <Glyph d={tab.icon} />
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
