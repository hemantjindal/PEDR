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
        {/* The answer, first and large. Nobody arrived wanting to read; they
            arrived wanting one fact, and the prose is for whoever stays. */}
        <p className="answer">{g.answer}</p>
      </div>

      {/* The numbers, before any sentence. */}
      <dl className="facts">
        {g.facts.map((f) => (
          <div key={f.k}>
            <dt>{f.k}</dt>
            <dd>{f.v}</dd>
          </div>
        ))}
      </dl>

      <section className="stack-s">
        {g.faq.map((f) => (
          <details className="qa" key={f.q}>
            <summary>{f.q}</summary>
            <p className="small dim">{f.a}</p>
          </details>
        ))}
      </section>

      {/* Everything above answers the question. This is for the one reader in
          ten who wants to know why, and it is placed where they will look. */}
      <details className="detail">
        <summary>The detail</summary>
        <div className="stack-l" style={{ marginTop: 22 }}>{g.body()}</div>
      </details>

      <section className="sheet stack-s">
        <h2>Keep a record without keeping a diary</h2>
        <p className="small dim">
          Point it at your calendar and your timesheet, and the quarterly sheets build themselves.
        </p>
        <div className="row-wrap">
          <Link href="/" className="btn btn-primary">See what yours looks like</Link>
          <Link href="/what-is-a-pedr" className="btn">A finished sheet</Link>
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
        Checked against {PEDR_SYSTEM.name} guidance, {PEDR_SYSTEM.asOf}. Your mentor and PSA sign
        at <a href={PEDR_SYSTEM.url} rel="noreferrer">{PEDR_SYSTEM.shortUrl}</a>.
      </p>
    </div>
  )
}
