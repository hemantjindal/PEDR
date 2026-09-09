import type { Metadata } from 'next'
import Link from 'next/link'
import { GUIDES, STANDALONE_PAGES } from '@/lib/content/guides'
import { PEDR_SYSTEM, REQUIREMENTS, SHEET_RULES } from '@/lib/pedr/constants'
import { absolute } from '@/lib/site'

export const metadata: Metadata = {
  title: 'PEDR guides · PEDR',
  description:
    'Straight answers about the RIBA PEDR: when sheets are due, what counts as experience, what ' +
    'a good entry looks like, who signs it, and what to do when you are a year behind.',
  alternates: { canonical: absolute('/guides') },
  openGraph: {
    type: 'website',
    url: absolute('/guides'),
    title: 'PEDR guides',
    description:
      'Straight answers about the RIBA PEDR — deadlines, what counts, what good looks like, and ' +
      'what to do when you are behind.',
  },
}

/**
 * The index.
 *
 * Ordered the way somebody arrives, not alphabetically: the deadline question
 * and the "I am a year behind" question are what people actually search, and
 * everything else is read afterwards.
 */
export default function GuidesIndex() {
  return (
    <div className="stack-l" style={{ maxWidth: 980 }}>
      <div className="stack-s">
        <span className="label">No account, no sign-up</span>
        <h1>Straight answers about the PEDR</h1>
        <p className="dim" style={{ maxWidth: '62ch' }}>
          {REQUIREMENTS.minTotalMonths} months of practical experience,{' '}
          {SHEET_RULES.requiredSheets} record sheets, one deadline every quarter that nobody tells
          you about. Most of what is written about this is a PDF you have not read. These are the
          questions people actually type in at eleven at night.
        </p>
      </div>

      {/* The two that are not reading — they are the thing itself — go first
          and look different, because somebody who arrived frightened should
          not have to pick their way down a list of articles to find them. */}
      <section className="stack">
        <span className="label">Start here</span>
        <div className="grid grid-2">
          {STANDALONE_PAGES.map((page) => (
            <Link key={page.slug} href={page.href} className="sheet stack-s">
              <span className="label label-ink">{page.question}</span>
              <h2>{page.title}</h2>
              <p className="small dim" style={{ flex: 1 }}>{page.description}</p>
              {/* Wrapped: a flex column stretches its children, and a chip
                  stretched to full width stops reading as a chip. */}
              <div><span className="chip chip-signal">Open →</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="stack">
        <span className="label">Every question, answered once</span>
        <div className="grid grid-2">
          {GUIDES.map((g) => (
            <Link key={g.slug} href={`/guides/${g.slug}`} className="sheet sheet-tight stack-s">
              <span className="label">{g.question}</span>
              <h3>{g.title}</h3>
              <p className="small dim">{g.answer}</p>
            </Link>
          ))}
        </div>
      </section>

      <p className="tiny faint">
        Everything here is checked against {PEDR_SYSTEM.name} guidance as of{' '}
        {PEDR_SYSTEM.asOf}, and the numbers are generated from the same rules the app runs on, so
        a guide cannot quietly disagree with the tool. The official record lives at{' '}
        <a href={PEDR_SYSTEM.url} rel="noreferrer">{PEDR_SYSTEM.shortUrl}</a>; this is not it.
      </p>
    </div>
  )
}
