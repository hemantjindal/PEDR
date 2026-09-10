import { ImageResponse } from 'next/og'
import { OG_INK, OG_PAPER, OG_SIGNAL, OG_SIZE, OG_TYPE, ogFonts } from '@/lib/og'
import { SITE } from '@/lib/site'

export const dynamic = 'force-static'
export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Months behind on your PEDR? It is already written down.'

/** The default card for every page that does not generate its own. */
export default async function Image() {
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

        <div
          style={{
            fontFamily: 'Familjen Grotesk',
            fontSize: 88,
            lineHeight: 1.02,
            letterSpacing: -2,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div>Months behind on</div>
          <div>your PEDR?</div>
          <div style={{ color: OG_SIGNAL }}>It is already written down.</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 24, opacity: 0.6 }}>
          <div style={{ width: 120, height: 4, background: OG_SIGNAL }} />
          <div>Rebuilt from your calendar and your timesheet</div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  )
}
