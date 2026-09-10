import type { Metadata } from 'next'
import Link from 'next/link'
import { GUIDES } from '@/lib/content/guides'
import { PEDR_SYSTEM } from '@/lib/pedr/constants'
import { absolute } from '@/lib/site'

export const metadata: Metadata = {
  title: 'PEDR answers · PEDR',
  description:
    'When sheets are due, what counts as experience, what a good entry looks like, who signs it, ' +
    'and what to do when you are a year behind. One question at a time.',
  alternates: { canonical: absolute('/guides') },
  openGraph: {
    type: 'website',
    url: absolute('/guides'),
    title: 'PEDR answers',
    description: 'Everything about the PEDR, one question at a time.',
  },
}

/**
 * A list of questions, and nothing else.
 *
 * This was nine cards each carrying its own answer, which is a page you have
 * to read rather than a page you can use. Somebody arrives with one question;
 * the index's only job is to get them to it.
 */
export default function GuidesIndex() {
  return (
    <div className="guide">
      <h1>Answers</h1>
      <p className="answer">Everything about the PEDR, one question at a time.</p>

      <nav className="questions" aria-label="Questions">
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/guides/${g.slug}`}>{g.question}</Link>
        ))}
        <Link href="/what-is-a-pedr">What does a PEDR actually look like?</Link>
      </nav>

      <div className="row-wrap">
        <Link href="/" className="btn btn-primary">Check where yours is</Link>
      </div>

      <p className="tiny faint">
        Checked against {PEDR_SYSTEM.name} guidance, {PEDR_SYSTEM.asOf}.
      </p>
    </div>
  )
}
