import type { Metadata, Viewport } from 'next'
// Self-hosted, so the app has no third-party font request and works offline.
// Plex was drawn for technical and engineering contexts; it has the slightly
// mechanical warmth of drawing-office lettering without being a novelty face.
import '@fontsource/ibm-plex-sans/300.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'PEDR',
  description:
    'Log your practical experience as it happens, and let the record sheets write themselves.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eceae5' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0c' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  )
}
