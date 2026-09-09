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

      <div className="stack-s">
        <Link href="/guides" className="label label-ink">← All guides</Link>
        <h1>{g.title}</h1>
        {/* The one-sentence answer, first, before any of the detail. It is what
            somebody came for and it is what a search result shows. */}
        <p style={{ fontSize: '1.05rem', lineHeight: 1.6, maxWidth: '60ch' }}>{g.answer}</p>
      </div>

      {g.body()}

      <section className="stack">
        <h2>Common questions</h2>
        <div className="stack-s">
          {g.faq.map((f) => (
            <div className="sheet sheet-tight stack-s" key={f.q}>
              <h3>{f.q}</h3>
              <p className="small dim">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sheet stack">
        <div className="sheet-head">
          <div>
            <span className="label">Reading this because you are behind</span>
            <h2 style={{ marginTop: 3 }}>It is already written down</h2>
          </div>
        </div>
        <p className="small dim">
          The record you are missing is sitting in your calendar and your practice timesheet. This
          pulls it back out, week by week, and tells you plainly which weeks it could not reach —
          rather than filling them in with something plausible.
        </p>
        <div className="row-wrap">
          <Link href="/behind" className="btn btn-primary">How far behind am I?</Link>
          <Link href="/what-is-a-pedr" className="btn">Show me a finished sheet</Link>
        </div>
      </section>

      {g.related.length > 0 && (
        <section className="stack">
          <h2>Read next</h2>
          <div className="stack-s">
            {g.related.map((slug) => {
              const related = guide(slug)
              const href = related ? `/guides/${related.slug}` : `/${slug}`
              const title = related?.title ?? 'What a PEDR actually looks like'
              const question = related?.question ?? 'What does a PEDR actually look like?'
              return (
                <Link key={slug} href={href} className="sheet sheet-tight stack-s">
                  <span className="label">{question}</span>
                  <h3>{title}</h3>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <p className="tiny faint">
        Checked against {PEDR_SYSTEM.name} guidance as of {PEDR_SYSTEM.asOf}. The official record
        is at <a href={PEDR_SYSTEM.url} rel="noreferrer">{PEDR_SYSTEM.shortUrl}</a>, and that is
        where your mentor and PSA sign.
      </p>
    </div>
  )
}
