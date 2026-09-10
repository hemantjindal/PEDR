import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GUIDES, guide } from '@/lib/content/guides'
import { PEDR_SYSTEM } from '@/lib/pedr/constants'
import { SITE, absolute } from '@/lib/site'

/**
 * One guide.
 *
 * Statically generated, revalidated daily because a couple of the pages show a
 * worked timetable anchored to the current month. The Q&A block at the bottom
 * is emitted twice on purpose: once for a person, once as FAQPage structured
 * data, from the same source, so the two cannot drift.
 */

export const revalidate = 86400

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const g = guide(slug)
  if (!g) return {}
  const url = absolute(`/guides/${g.slug}`)
  return {
    title: `${g.metaTitle} · ${SITE.titleSuffix}`,
    description: g.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: g.metaTitle,
      description: g.description,
      siteName: SITE.name,
    },
    twitter: { card: 'summary_large_image', title: g.metaTitle, description: g.description },
  }
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const g = guide(slug)
  if (!g) notFound()

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: g.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <div className="stack-l" style={{ maxWidth: 780 }}>
      <script
        type="application/ld+json"
        // Generated from our own constants; there is no user input in it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <div className="guide">
        <Link href="/guides" className="back">← All answers</Link>
        <h1>{g.question}</h1>
        <p className="answer">{g.answer}</p>

        <dl className="facts">
          {g.facts.map((f) => (
            <div key={f.k}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>

        <div className="qa-list">
          {g.faq.map((f) => (
            <details className="qa" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>

        <div className="row-wrap">
          <Link href="/" className="btn btn-primary">See what yours looks like</Link>
        </div>

        {g.related.length > 0 && (
          <nav className="read-next" aria-label="Related answers">
            {g.related.map((slug) => {
              const related = guide(slug)
              return (
                <Link key={slug} href={related ? `/guides/${related.slug}` : `/${slug}`}>
                  {related?.question ?? 'What a PEDR actually is'}
                </Link>
              )
            })}
          </nav>
        )}

        <p className="tiny faint">
          Checked against {PEDR_SYSTEM.name} guidance, {PEDR_SYSTEM.asOf}.
        </p>
      </div>
    </div>
  )
}
