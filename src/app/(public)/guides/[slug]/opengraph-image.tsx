import { ImageResponse } from 'next/og'
import { GUIDES, guide } from '@/lib/content/guides'
import { OG_INK, OG_PAPER, OG_SIGNAL, OG_SIZE, OG_TYPE, ogFonts } from '@/lib/og'
import { SITE } from '@/lib/site'

export const dynamic = 'force-static'
export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'PEDR guide'

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }))
}

/**
 * The card that gets pasted into a WhatsApp group at midnight, which is
 * realistically how most people will arrive. So it leads with the question,
 * not with the product name.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const g = guide(slug)
  const question = g?.question ?? 'Straight answers about the PEDR'
  const title = g?.title ?? SITE.tagline

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: OG_PAPER,
          color: OG_INK,
          padding: 72,
          fontFamily: 'IBM Plex Mono',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              background: OG_SIGNAL,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Familjen Grotesk',
              fontSize: 28,
            }}
          >
            P
          </div>
          <div style={{ fontSize: 24, letterSpacing: 5 }}>
            {SITE.name}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 28, color: OG_SIGNAL, letterSpacing: 1, fontFamily: 'IBM Plex Mono' }}>{question}</div>
          <div
            style={{
              fontFamily: 'Familjen Grotesk',
              fontSize: title.length > 40 ? 68 : 84,
              lineHeight: 1.02,
              letterSpacing: -2,
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 24, opacity: 0.6 }}>
          <div style={{ width: 120, height: 4, background: OG_SIGNAL }} />
          <div>No account needed</div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  )
}
