import type { Metadata, Viewport } from 'next'
// Self-hosted, so there is no third-party font request and it works offline.
// Familjen Grotesk carries the headlines: narrow, confident, a face with an
// opinion. Figtree reads warmly underneath it. IBM Plex Mono does every label,
// figure and dimension — it is what makes the interface read as annotated
// rather than typed, and it is the character in the whole thing.
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/familjen-grotesk/500.css'
import '@fontsource/familjen-grotesk/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './globals.css'
import { ServiceWorker } from '@/components/offline'
import { SITE, origin } from '@/lib/site'

export const metadata: Metadata = {
  // Every canonical, OpenGraph and sitemap URL is resolved against this, so it
  // has to be absolute and it has to be right in production.
  metadataBase: new URL(origin()),
  title: SITE.tagline,
  description: SITE.description,
  manifest: '/manifest.webmanifest',
  applicationName: 'PEDR',
  appleWebApp: {
    // iOS ignores the manifest entirely and reads these instead.
    capable: true,
    title: 'PEDR',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: {
    // "1042" is a job number, not a phone number to be turned into a link.
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The app draws its own background to the edges of the screen, so the
  // notch and the home indicator have to be accounted for in CSS instead.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2efe6' },
    { media: '(prefers-color-scheme: dark)', color: '#16150f' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
