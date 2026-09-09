import type { Metadata, Viewport } from 'next'
// Self-hosted, so there is no third-party font request and it works offline.
// Archivo Black carries the headline weight signage needs; Archivo is the same
// skeleton at reading weight, so the two never look like different families.
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo-black/400.css'
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
    { media: '(prefers-color-scheme: light)', color: '#0d0c0a' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0c0a' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  )
}
