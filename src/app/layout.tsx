import type { Metadata, Viewport } from 'next'
// Self-hosted, so there is no third-party font request and it works offline.
// Archivo Black carries the headline weight signage needs; Archivo is the same
// skeleton at reading weight, so the two never look like different families.
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo-black/400.css'
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
    { media: '(prefers-color-scheme: light)', color: '#0d0c0a' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0c0a' },
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
